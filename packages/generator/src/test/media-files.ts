import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
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

/** Whether libjxl's cjxl and djxl are installed, for JPEG XL tests. */
export const hasJxlTools = await Promise.all(
  ["cjxl", "djxl"].map((command) => promisify(execFile)(command, ["--version"])),
).then(
  () => true,
  () => false,
);

/**
 * Writes a small JPEG XL photo (64x48) with the given EXIF tags via cjxl, which stores them
 * Brotli-compressed ("brob" boxes) unless `compressBoxes` is false.
 */
export async function writeJxl(file: string, tags: WriteTags = {}, compressBoxes = true) {
  const jpeg = await writePhoto(`${file}.jpg`, tags);
  await promisify(execFile)("cjxl", [
    jpeg,
    file,
    "--lossless_jpeg=0",
    "--distance=1",
    `--compress_boxes=${compressBoxes ? 1 : 0}`,
    "--quiet",
  ]);
  await rm(jpeg);
  return file;
}
