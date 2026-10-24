import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ExifTool } from "exiftool-vendored";
import type { MediaKind } from "./discover.ts";
import { expandJxlBoxes } from "./jxl.ts";

/**
 * The metadata tags Retrace uses, as raw strings from exiftool (cached by content hash).
 * Interpretation (timezones, priorities) happens in `timestamps.ts`, not here.
 */
export interface RawMetadata {
  dateTimeOriginal?: string;
  offsetTimeOriginal?: string;
  subSecTimeOriginal?: string;
  createDate?: string;
  offsetTimeDigitized?: string;
  subSecTimeDigitized?: string;
  quickTimeCreateDate?: string;
  quickTimeMediaCreateDate?: string;
  /** Apple's timezone-aware creation date */
  quickTimeCreationDate?: string;
  make?: string;
  model?: string;
  /** Signed decimal degrees */
  gpsLatitude?: number;
  gpsLongitude?: number;
  /** exiftool's error for files it could not read */
  error?: string;
}

/**
 * Tags to request, by exiftool group. `#` disables print conversion, which makes exiftool
 * return signed decimal degrees for GPS.
 *
 * We use `readRaw` instead of exiftool-vendored's `read`, because `read` infers and applies
 * timezones on its own (from GPS, other tags, or by assuming UTC for videos). SPEC section 7
 * needs different rules, e.g. dates without an offset are in the trip timezone. Without
 * `-api QuickTimeUTC`, exiftool returns QuickTime dates exactly as stored, i.e. in UTC.
 */
const TAGS: Record<keyof Omit<RawMetadata, "error">, string[]> = {
  dateTimeOriginal: ["EXIF:DateTimeOriginal", "XMP:DateTimeOriginal"],
  offsetTimeOriginal: ["EXIF:OffsetTimeOriginal"],
  subSecTimeOriginal: ["EXIF:SubSecTimeOriginal"],
  createDate: ["EXIF:CreateDate", "XMP:CreateDate"],
  offsetTimeDigitized: ["EXIF:OffsetTimeDigitized"],
  subSecTimeDigitized: ["EXIF:SubSecTimeDigitized"],
  quickTimeCreateDate: ["QuickTime:CreateDate"],
  quickTimeMediaCreateDate: ["QuickTime:MediaCreateDate"],
  quickTimeCreationDate: ["QuickTime:CreationDate"],
  make: ["EXIF:Make", "QuickTime:Make", "QuickTime:AndroidMake"],
  model: ["EXIF:Model", "QuickTime:Model", "QuickTime:AndroidModel"],
  gpsLatitude: ["Composite:GPSLatitude#"],
  gpsLongitude: ["Composite:GPSLongitude#"],
};

const READ_ARGS = [...Object.values(TAGS).flat(), "ExifTool:Error"].map((tag) => `-${tag}`);

export interface MetadataReader {
  read(file: string, kind: MediaKind): Promise<RawMetadata>;
  close(): Promise<void>;
}

export function createMetadataReader(): MetadataReader {
  const exiftool = new ExifTool({ maxProcs: Math.max(1, Math.min(os.availableParallelism(), 8)) });
  return {
    async read(file, kind) {
      // -fast stops reading JPEGs at the image data; videos may keep metadata at the end.
      const readArgs = [...(kind === "photo" ? ["-fast"] : []), "-G", ...READ_ARGS];
      const readRaw = async (target: string) =>
        toRawMetadata((await exiftool.readRaw(target, { readArgs })) as Record<string, unknown>);
      const expanded =
        path.extname(file).toLowerCase() === ".jxl"
          ? expandJxlBoxes(await readFile(file))
          : undefined;
      if (!expanded) return readRaw(file);
      // exiftool can't read compressed JPEG XL metadata; give it a copy with plain boxes.
      const temp = path.join(os.tmpdir(), `retrace-${randomUUID()}.jxl`);
      try {
        await writeFile(temp, expanded);
        return await readRaw(temp);
      } finally {
        await rm(temp, { force: true });
      }
    },
    close: () => exiftool.end(),
  };
}

/** Picks the first present tag per field from exiftool's `-G -json` output. */
export function toRawMetadata(raw: Record<string, unknown>): RawMetadata {
  const result: RawMetadata = {};
  for (const [field, tags] of Object.entries(TAGS) as [keyof typeof TAGS, string[]][]) {
    for (const tag of tags) {
      const value = raw[tag.replace(/#$/, "")];
      if (value === undefined || value === null || value === "") continue;
      if (field === "gpsLatitude" || field === "gpsLongitude") {
        const number = typeof value === "number" ? value : Number(value);
        if (Number.isFinite(number)) result[field] = number;
      } else {
        const text = String(value).trim();
        if (text !== "") result[field] = text;
      }
      if (result[field] !== undefined) break;
    }
  }
  const errors = [raw["ExifTool:Error"], ...(Array.isArray(raw.errors) ? raw.errors : [])];
  const error = errors.find((e): e is string => typeof e === "string" && e !== "");
  if (error !== undefined) result.error = error;
  return result;
}
