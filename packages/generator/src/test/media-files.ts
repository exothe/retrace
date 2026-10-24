import { mkdir } from "node:fs/promises";
import path from "node:path";
import { ExifTool } from "exiftool-vendored";
import type { WriteTags } from "exiftool-vendored";
import sharp from "sharp";

/** Writes a small JPEG (or PNG, by extension) with the given EXIF tags. */
export async function writePhoto(file: string, tags: WriteTags = {}, color = "#c0603a") {
  await mkdir(path.dirname(file), { recursive: true });
  const image = sharp({ create: { width: 64, height: 48, channels: 3, background: color } });
  await (file.toLowerCase().endsWith(".png") ? image.png() : image.jpeg()).toFile(file);
  if (Object.keys(tags).length > 0) {
    const exiftool = new ExifTool({ maxProcs: 1 });
    try {
      await exiftool.write(file, tags, { writeArgs: ["-overwrite_original"] });
    } finally {
      await exiftool.end();
    }
  }
  return file;
}
