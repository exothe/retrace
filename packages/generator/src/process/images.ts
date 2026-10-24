import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { TripConfig } from "../config.ts";

/** Bump when image processing changes, so cached outputs are regenerated. */
export const IMAGE_VERSION = 2;

export type ImageSettings = TripConfig["images"];

export interface ImageInfo {
  /** Of the display version */
  width: number;
  height: number;
  /** Dominant color, "#rrggbb" */
  color: string;
}

/**
 * Writes `thumb.avif` (width `thumbWidth`) and `display.avif` (longest side `displayWidth`)
 * into `dir` (SPEC section 8.3): auto-rotated by EXIF orientation, never upscaled, without
 * metadata (sharp strips it by default).
 */
export async function renderImage(
  input: string | Buffer,
  settings: ImageSettings,
  dir: string,
  names = { thumb: "thumb.avif", display: "display.avif" },
): Promise<ImageInfo> {
  const base = sharp(input, { failOn: "error" }).rotate();
  const avif = { quality: settings.quality };

  const display = await base
    .clone()
    .resize({
      width: settings.displayWidth,
      height: settings.displayWidth,
      fit: "inside",
      withoutEnlargement: true,
    })
    .avif(avif)
    .toBuffer({ resolveWithObject: true });
  const thumb = await base
    .clone()
    .resize({ width: settings.thumbWidth, withoutEnlargement: true })
    .avif(avif)
    .toBuffer();

  await writeFile(path.join(dir, names.display), display.data);
  await writeFile(path.join(dir, names.thumb), thumb);
  const { dominant } = await sharp(thumb).stats();
  return { width: display.info.width, height: display.info.height, color: toHex(dominant) };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}
