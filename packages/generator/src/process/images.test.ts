import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { useTempDir } from "../test/temp-dir.ts";
import { writePhoto } from "../test/media-files.ts";
import { renderImage } from "./images.ts";

const tempDir = useTempDir();
const SETTINGS = { thumbWidth: 20, displayWidth: 40, quality: 75 };

async function source(dir: string, width: number, height: number, tags = {}) {
  const file = path.join(dir, `src-${width}x${height}.jpg`);
  await sharp({ create: { width, height, channels: 3, background: "#3366cc" } })
    .jpeg()
    .toFile(file);
  if (Object.keys(tags).length > 0) await writePhoto(file, tags); // rewrites with tags
  return file;
}

describe("renderImage", () => {
  it("writes AVIF thumbnail and display versions within the size limits", async () => {
    const { dir } = await tempDir();
    const info = await renderImage(await source(dir, 80, 60), SETTINGS, dir);
    expect(info).toEqual({
      width: 40,
      height: 30,
      color: expect.stringMatching(/^#[0-9a-f]{6}$/) as string,
    });
    const thumb = await sharp(path.join(dir, "thumb.avif")).metadata();
    expect([thumb.format, thumb.width, thumb.height]).toEqual(["heif", 20, 15]);
  });

  it("limits the longest side for portrait images and the width for thumbnails", async () => {
    const { dir } = await tempDir();
    const info = await renderImage(await source(dir, 60, 80), SETTINGS, dir);
    expect([info.width, info.height]).toEqual([30, 40]);
    const thumb = await sharp(path.join(dir, "thumb.avif")).metadata();
    expect([thumb.width, thumb.height]).toEqual([20, 27]);
  });

  it("never upscales", async () => {
    const { dir } = await tempDir();
    const info = await renderImage(await source(dir, 16, 12), SETTINGS, dir);
    expect([info.width, info.height]).toEqual([16, 12]);
  });

  it("applies EXIF orientation and strips all metadata", async () => {
    const { dir } = await tempDir();
    const file = await writePhoto(path.join(dir, "rotated.jpg"), {
      "Orientation#": 6,
      GPSLatitude: 38.7,
      GPSLongitude: -9.1,
      DateTimeOriginal: "2026:10:23 09:15:12",
    } as never);
    const info = await renderImage(file, SETTINGS, dir);
    // writePhoto makes 64x48; orientation 6 turns it upright as 48x64.
    expect([info.width, info.height]).toEqual([30, 40]);
    const meta = await sharp(path.join(dir, "display.avif")).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("finds the dominant color", async () => {
    const { dir } = await tempDir();
    const file = path.join(dir, "red.png");
    await sharp({ create: { width: 30, height: 30, channels: 3, background: "#d02020" } })
      .png()
      .toFile(file);
    const { color } = await renderImage(file, SETTINGS, dir);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(70);
    expect(b).toBeLessThan(70);
  });

  it("rejects broken files", async () => {
    const { write, dir } = await tempDir();
    const file = await write("broken.jpg", "not an image");
    await expect(renderImage(file, SETTINGS, dir)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe("not an image");
  });
});
