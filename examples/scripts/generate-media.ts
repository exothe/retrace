// Generates the test media for the sample trip (SPEC section 12) into examples/generated/,
// which is git-ignored. Each file exercises one rule of timestamp resolution (SPEC section 7)
// or discovery (SPEC section 8.1); see the comments in PHOTOS and VIDEOS_SPEC.
//
// Requires ffmpeg on PATH (or FFMPEG_PATH). Run with `npm run examples:generate`.

import { execFile } from "node:child_process";
import { copyFile, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ExifTool } from "exiftool-vendored";
import type { WriteTags } from "exiftool-vendored";
import sharp from "sharp";

const run = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";

/** Default output folder; the trip config in examples/lissabon-2026 points here. */
export const DEFAULT_OUT = path.resolve(import.meta.dirname, "..", "generated", "lissabon-2026");

const ALFAMA = { lat: 38.7114, lon: -9.1305 };
const SINTRA = { lat: 38.7876, lon: -9.3906 };
const BELEM = { lat: 38.6916, lon: -9.2157 };

interface PhotoSpec {
  file: string;
  label: string;
  color: string;
  width?: number;
  height?: number;
  tags?: WriteTags;
  gps?: { lat: number; lon: number };
  /** Modification time; only matters for files without any other timestamp */
  mtime?: string;
}

// Lisbon is UTC+1 (WEST) until 25.10.2026 01:00 UTC, then UTC+0 (WET).
const PHOTOS: PhotoSpec[] = [
  {
    // EXIF date with offset and subseconds: an exact instant. Also the cover photo.
    file: "IMG_20261023_091512.jpg",
    label: "Alfama 09:15",
    color: "#c0603a",
    tags: {
      Make: "Google",
      Model: "Pixel 8",
      DateTimeOriginal: "2026:10:23 09:15:12",
      OffsetTimeOriginal: "+01:00",
      SubSecTimeOriginal: "250",
    },
    gps: ALFAMA,
  },
  {
    // EXIF date without offset: interpreted in the trip timezone.
    file: "DSC_0042.jpg",
    label: "Miradouro 13:45",
    color: "#3a7bc0",
    width: 1200,
    height: 1600,
    tags: {
      Make: "NIKON CORPORATION",
      Model: "NIKON Z 6",
      DateTimeOriginal: "2026:10:23 13:45:00",
    },
  },
  {
    // Camera clock 2:30 min fast, corrected by cameraOffsets["Canon EOS R6"]. Upper-case
    // extension, nested folder, stored sideways with an EXIF orientation.
    file: "canon/IMG_0815.JPG",
    label: "Sintra 10:30",
    color: "#4f9a55",
    tags: {
      Make: "Canon",
      Model: "Canon EOS R6",
      DateTimeOriginal: "2026:10:24 10:32:30",
      OffsetTimeOriginal: "+01:00",
      "Orientation#": 6,
    } as WriteTags,
    gps: SINTRA,
  },
  {
    // Only CreateDate.
    file: "scan.jpg",
    label: "Pena 16:20",
    color: "#9a4f8c",
    tags: { CreateDate: "2026:10:24 16:20:00" },
  },
  // No metadata: local time from the file name.
  { file: "IMG_20261024_120000.jpg", label: "Picknick 12:00", color: "#b5a13a" },
  // Google Pixel file name: UTC. 22:45 UTC is 23:45 local, after the [23:40] entry.
  { file: "PXL_20261024_224500123.jpg", label: "Bairro Alto 23:45", color: "#2c2c54" },
  {
    // Samsung file name, local time, PNG. 00:20 on 25.10. belongs to the 24.10. page,
    // because that day rolls over until its [00:30] entry.
    file: "20261025_002000.png",
    label: "Bar 00:20",
    color: "#6b2c54",
  },
  {
    // A date with no day heading: becomes a media-only day and triggers a warning.
    file: "ankunft.jpg",
    label: "Ankunft 22.10.",
    color: "#3a9a9a",
    tags: { DateTimeOriginal: "2026:10:22 18:30:00" },
  },
  {
    // NFD-normalized file name (as macOS may return it).
    file: "Café Brasileira.jpg",
    label: "Café 11:00",
    color: "#7a5230",
    tags: { DateTimeOriginal: "2026:10:25 11:00:00" },
    gps: { lat: 38.7107, lon: -9.1424 },
  },
  {
    // No timestamp at all: falls back to the file modification time, with a warning.
    file: "ohne-datum.jpg",
    label: "Ohne Datum",
    color: "#808080",
    mtime: "2026-10-25T15:00:00Z",
  },
];

interface VideoSpec {
  file: string;
  size: string;
  /** QuickTime CreateDate, UTC */
  creationTime?: string;
  /** Apple CreationDate with offset; preferred over CreateDate */
  appleCreationDate?: string;
  gps?: { lat: number; lon: number };
}

const VIDEOS_SPEC: VideoSpec[] = [
  {
    // QuickTime CreateDate (UTC) 09:00Z = 10:00 local, with a GPS location.
    file: "VID_20261023_100000.mp4",
    size: "640x360",
    creationTime: "2026-10-23T09:00:00Z",
    gps: ALFAMA,
  },
  {
    // Portrait .mov with a timezone-aware CreationDate (12:21) that wins over
    // CreateDate (12:20Z). Both are after the DST switch, so local = UTC.
    file: "tram.mov",
    size: "360x640",
    creationTime: "2026-10-25T12:20:00Z",
    appleCreationDate: "2026-10-25T12:21:00+0000",
    gps: BELEM,
  },
];

function labelSvg(width: number, height: number, label: string): Buffer {
  const fontSize = Math.round(Math.min(width, height) / 9);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect x="${width * 0.05}" y="${height * 0.05}" width="${width * 0.9}" height="${height * 0.9}"
        fill="none" stroke="white" stroke-width="${fontSize / 6}" />
      <text x="50%" y="50%" font-family="sans-serif" font-size="${fontSize}" fill="white"
        text-anchor="middle" dominant-baseline="middle">${label}</text>
    </svg>`,
  );
}

async function makePhoto(exiftool: ExifTool, fotos: string, spec: PhotoSpec): Promise<string> {
  const file = path.join(fotos, spec.file);
  await mkdir(path.dirname(file), { recursive: true });
  const width = spec.width ?? 1600;
  const height = spec.height ?? 1200;
  const image = sharp({ create: { width, height, channels: 3, background: spec.color } }).composite(
    [{ input: labelSvg(width, height, spec.label) }],
  );
  if (file.toLowerCase().endsWith(".png")) await image.png().toFile(file);
  else await image.jpeg({ quality: 85 }).toFile(file);

  const tags: WriteTags = { ...spec.tags };
  if (spec.gps) {
    // exiftool-vendored derives GPSLatitudeRef/GPSLongitudeRef from the sign.
    Object.assign(tags, { GPSLatitude: spec.gps.lat, GPSLongitude: spec.gps.lon });
  }
  if (Object.keys(tags).length > 0) {
    await exiftool.write(file, tags, { writeArgs: ["-overwrite_original"] });
  }
  if (spec.mtime) await utimes(file, new Date(spec.mtime), new Date(spec.mtime));
  return file;
}

/** ISO 6709, as written by phones: "+38.7114-009.1305/" */
function iso6709({ lat, lon }: { lat: number; lon: number }): string {
  const fmt = (value: number, intDigits: number) =>
    (value < 0 ? "-" : "+") +
    Math.abs(value)
      .toFixed(4)
      .padStart(intDigits + 5, "0");
  return `${fmt(lat, 2)}${fmt(lon, 3)}/`;
}

async function makeVideo(videos: string, spec: VideoSpec): Promise<string> {
  const file = path.join(videos, spec.file);
  await mkdir(path.dirname(file), { recursive: true });
  const metadata: string[] = [];
  if (spec.creationTime) metadata.push("-metadata", `creation_time=${spec.creationTime}`);
  if (spec.gps) metadata.push("-metadata", `location=${iso6709(spec.gps)}`);
  if (spec.appleCreationDate) {
    metadata.push(
      "-metadata",
      `com.apple.quicktime.creationdate=${spec.appleCreationDate}`,
      "-movflags",
      "use_metadata_tags",
    );
  }
  await run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc=duration=3:size=${spec.size}:rate=25`,
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    ...metadata,
    file,
  ]);
  return file;
}

/**
 * Generates the sample media into `out` (replacing what is there): `out/Fotos` and
 * `out/Videos`.
 */
export async function generateSampleMedia(out: string = DEFAULT_OUT): Promise<void> {
  const fotos = path.join(out, "Fotos");
  const videos = path.join(out, "Videos");
  await rm(out, { recursive: true, force: true });
  await mkdir(fotos, { recursive: true });

  const exiftool = new ExifTool();
  try {
    for (const spec of PHOTOS) await makePhoto(exiftool, fotos, spec);
  } finally {
    await exiftool.end();
  }
  for (const spec of VIDEOS_SPEC) await makeVideo(videos, spec);

  // An identical copy: processed once, reported as a duplicate.
  await copyFile(
    path.join(fotos, "IMG_20261023_091512.jpg"),
    path.join(fotos, "Kopie von IMG_20261023_091512.jpg"),
  );

  // Ignored files.
  const ignored = path.join(fotos, "IMG_20261023_091512.jpg");
  await copyFile(ignored, path.join(fotos, ".hidden.jpg"));
  await copyFile(ignored, path.join(fotos, ".trashed-1767225600-IMG_9.jpg"));
  await mkdir(path.join(fotos, ".thumbnails"));
  await copyFile(ignored, path.join(fotos, ".thumbnails", "thumb.jpg"));
  await writeFile(path.join(fotos, "Thumbs.db"), "");
  await writeFile(path.join(fotos, ".DS_Store"), "");

  // Unsupported files, listed once in the summary.
  await writeFile(path.join(fotos, "IMG_1234.HEIC"), "not really HEIC");
  await writeFile(path.join(fotos, "notizen.txt"), "Notizen");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateSampleMedia();
  console.log(`Generated sample media in ${path.relative(process.cwd(), DEFAULT_OUT)}`);
}
