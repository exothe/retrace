import path from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { useTempDir } from "../test/temp-dir.ts";
import { hasJxlTools, writeJxl } from "../test/media-files.ts";
import { checkDjxl, decodeJxl, djxlInstallHint } from "./djxl.ts";
import { ToolMissingError } from "./ffmpeg.ts";
import { renderImage } from "./images.ts";

const tempDir = useTempDir();

describe("decodeJxl", () => {
  it.runIf(hasJxlTools)(
    "decodes to an upright PNG that renderImage doesn't rotate again",
    async () => {
      const { dir } = await tempDir();
      // 64x48, rotated by 90° via EXIF orientation 6
      const file = await writeJxl(path.join(dir, "a.jxl"), { "Orientation#": 6 });
      const decoded = path.join(dir, "decoded.png");
      await decodeJxl("djxl", file, decoded);
      expect(await sharp(decoded).metadata()).toMatchObject({
        format: "png",
        width: 48,
        height: 64,
      });

      const out = path.join(dir, "out");
      await mkdir(out);
      const info = await renderImage(
        decoded,
        { thumbWidth: 24, displayWidth: 40, quality: 50 },
        out,
      );
      expect([info.width, info.height]).toEqual([30, 40]);
      expect((await readdir(out)).sort()).toEqual(["display.avif", "thumb.avif"]);
    },
  );

  it.runIf(hasJxlTools)("rejects files djxl can't decode", async () => {
    const { write } = await tempDir();
    const file = await write("broken.jxl", "not a jpeg xl file");
    await expect(decodeJxl("djxl", file, `${file}.png`)).rejects.toThrow();
  });
});

describe("checkDjxl", () => {
  it("reports a missing djxl with an install hint", async () => {
    const error = await checkDjxl("retrace-no-such-djxl").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ToolMissingError);
    expect((error as Error).message).toMatch(/^djxl \(retrace-no-such-djxl\): not found\. /);
  });

  it.runIf(hasJxlTools)("accepts an installed djxl", async () => {
    await expect(checkDjxl("djxl")).resolves.toBeUndefined();
  });
});

describe("djxlInstallHint", () => {
  it("names the package per OS", () => {
    expect(djxlInstallHint("darwin")).toContain("brew install jpeg-xl");
    expect(djxlInstallHint("win32")).toContain("djxlPath");
    expect(djxlInstallHint("linux")).toContain("apt install libjxl-tools");
  });
});
