import { stat } from "node:fs/promises";
import path from "node:path";
import type { DateTime } from "luxon";
import type { Cache } from "../cache.ts";
import { mapLimit } from "../concurrency.ts";
import type { TripConfig } from "../config.ts";
import { displayPath } from "../diagnostics.ts";
import type { Diagnostic } from "../diagnostics.ts";
import type { Output } from "../output.ts";
import { comparePaths, discover } from "./discover.ts";
import type { MediaKind } from "./discover.ts";
import { createMetadataReader } from "./metadata.ts";
import type { MetadataReader, RawMetadata } from "./metadata.ts";
import { resolveTimestamp } from "./timestamps.ts";
import type { TimestampSource } from "./timestamps.ts";

export interface MediaItem {
  /** First 12 hex characters of the content hash */
  id: string;
  hash: string;
  kind: MediaKind;
  /** The file used for this content; duplicates are listed separately */
  path: string;
  /** Other files with identical content */
  duplicates: string[];
  size: number;
  metadata: RawMetadata;
  takenAt: DateTime;
  timestampSource: TimestampSource;
  camera?: string;
  cameraOffsetKey?: string;
  gps?: { lat: number; lon: number };
  title?: string;
  caption?: string;
}

export interface MediaScan {
  /** Sorted by takenAt, then path */
  media: MediaItem[];
  /** FIT files, sorted by path */
  tracks: string[];
  unsupported: string[];
  diagnostics: Diagnostic[];
}

export interface ScanOptions {
  cache: Cache;
  out: Output;
  /** For tests; defaults to exiftool */
  reader?: MetadataReader;
}

const HASH_CONCURRENCY = 4;
const METADATA_CONCURRENCY = 16;

/**
 * Discovers media and tracks, hashes them, reads (cached) metadata and resolves timestamps
 * (SPEC sections 7, 8.1, 8.2 and 8.6).
 */
export async function scanMedia(config: TripConfig, options: ScanOptions): Promise<MediaScan> {
  const { cache, out } = options;
  const diagnostics: Diagnostic[] = [];
  const found = await discover([...config.media, ...config.tracks]);

  let hashed = 0;
  const files = await mapLimit(found.media, HASH_CONCURRENCY, async (file) => {
    const info = await stat(file.path);
    const hash = await cache.hash(file.path, info);
    out.progress(`Hashing ${++hashed}/${found.media.length} ${path.basename(file.path)}`);
    return { ...file, hash, size: info.size, mtime: info.mtime };
  });

  // Identical content is processed once; the first path (sorted) represents it.
  const byHash = new Map<string, typeof files>();
  for (const file of files) {
    const group = byHash.get(file.hash);
    if (group) group.push(file);
    else byHash.set(file.hash, [file]);
  }
  for (const group of byHash.values()) {
    if (group.length > 1) {
      group.sort((a, b) => comparePaths(a.path, b.path));
      diagnostics.push({
        severity: "warning",
        file: group[0]!.path,
        message: `identical files, using this one and skipping: ${group
          .slice(1)
          .map((f) => displayPath(f.path))
          .join(", ")}`,
      });
    }
  }

  const unique = [...byHash.values()].map((group) => group[0]!);
  const reader = options.reader ?? createMetadataReader();
  let read = 0;
  let items: MediaItem[];
  try {
    items = await mapLimit(unique, METADATA_CONCURRENCY, async (file) => {
      let metadata = await cache.readMetadata<RawMetadata>(file.hash);
      if (!metadata) {
        metadata = await reader.read(file.path, file.kind);
        await cache.writeMetadata(file.hash, metadata);
      }
      out.progress(`Reading metadata ${++read}/${unique.length} ${path.basename(file.path)}`);

      if (metadata.error) {
        diagnostics.push({
          severity: "warning",
          file: file.path,
          message: `cannot read metadata: ${metadata.error}`,
        });
      }
      const timestamp = resolveTimestamp(
        { kind: file.kind, file: file.path, mtime: file.mtime, metadata },
        config,
      );
      if (timestamp.source === "mtime") {
        diagnostics.push({
          severity: "warning",
          file: file.path,
          message: "no timestamp in metadata or file name, using the file modification time",
        });
      }
      const gps = toGps(metadata);
      const texts = toTexts(metadata);
      return {
        id: file.hash.slice(0, 12),
        hash: file.hash,
        kind: file.kind,
        path: file.path,
        duplicates: byHash
          .get(file.hash)!
          .slice(1)
          .map((f) => f.path),
        size: file.size,
        metadata,
        takenAt: timestamp.instant,
        timestampSource: timestamp.source,
        ...(timestamp.camera !== undefined && { camera: timestamp.camera }),
        ...(timestamp.cameraOffsetKey !== undefined && {
          cameraOffsetKey: timestamp.cameraOffsetKey,
        }),
        ...(gps && { gps }),
        ...texts,
      };
    });
  } finally {
    if (!options.reader) await reader.close();
    await cache.save();
  }

  const usedOffsets = new Set(items.map((item) => item.cameraOffsetKey));
  for (const key of Object.keys(config.cameraOffsets)) {
    if (!usedOffsets.has(key)) {
      diagnostics.push({
        severity: "warning",
        file: config.configFile,
        message: `cameraOffsets: "${key}" matches no photo or video`,
      });
    }
  }

  items.sort((a, b) => a.takenAt.toMillis() - b.takenAt.toMillis() || comparePaths(a.path, b.path));
  return { media: items, tracks: found.tracks, unsupported: found.unsupported, diagnostics };
}

/** Valid GPS position, ignoring 0,0 (SPEC section 8.6). */
export function toGps(metadata: RawMetadata): { lat: number; lon: number } | undefined {
  const { gpsLatitude: lat, gpsLongitude: lon } = metadata;
  if (lat === undefined || lon === undefined) return undefined;
  if (lat === 0 && lon === 0) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  return { lat, lon };
}

/** Default image descriptions some cameras write; they are not captions. */
const CAMERA_PLACEHOLDERS = new Set(
  [
    "OLYMPUS DIGITAL CAMERA",
    "SONY DSC",
    "DIGITAL CAMERA",
    "KONICA MINOLTA DIGITAL CAMERA",
    "MINOLTA DIGITAL CAMERA",
    "LEICA DIGITAL CAMERA",
    "Exif_JPEG_PICTURE",
  ].map((text) => text.toLowerCase()),
);

/**
 * Title and caption from the metadata (SPEC section 8.6), without camera placeholders and
 * texts that only repeat the camera make or model.
 */
export function toTexts(metadata: RawMetadata): { title?: string; caption?: string } {
  const ignored = new Set(
    [metadata.make, metadata.model, ...CAMERA_PLACEHOLDERS]
      .filter((text) => text !== undefined)
      .map((text) => text.toLowerCase()),
  );
  const clean = (text: string | undefined) => {
    const normalized = text?.replace(/\r\n?/g, "\n").trim().normalize("NFC");
    return normalized && !ignored.has(normalized.toLowerCase()) ? normalized : undefined;
  };
  const title = clean(metadata.title);
  const caption = clean(metadata.caption);
  return {
    ...(title !== undefined && { title }),
    ...(caption !== undefined && caption !== title && { caption }),
  };
}
