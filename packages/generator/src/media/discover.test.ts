import path from "node:path";
import { symlink } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { useTempDir } from "../test/temp-dir.ts";
import { classify, discover, isIgnored, summarizeUnsupported } from "./discover.ts";

const tempDir = useTempDir();

describe("discover", () => {
  it("scans folders recursively, classifies by extension and ignores junk", async () => {
    const { dir, write } = await tempDir();
    for (const file of [
      "Fotos/a.jpg",
      "Fotos/b.JPEG",
      "Fotos/c.png",
      "Fotos/d.webp",
      "Fotos/d2.JXL",
      "Fotos/sub/deeper/e.Jpg",
      "Fotos/v.MP4",
      "Fotos/v.mov",
      "Fotos/v.m4v",
      "Fotos/v.3gp",
      "Fotos/v.mkv",
      "Fotos/track.FIT",
      "Fotos/x.heic",
      "Fotos/raw.CR3",
      "Fotos/README",
      "Fotos/.hidden.jpg",
      "Fotos/.trashed-1767225600-IMG_1.jpg",
      "Fotos/.DS_Store",
      "Fotos/Thumbs.db",
      "Fotos/.thumbnails/t.jpg",
      "Fotos/.stfolder/s.jpg",
      "Fotos/sub/.thumbnails/t.jpg",
    ]) {
      await write(file);
    }
    const result = await discover([path.join(dir, "Fotos")]);
    const rel = (p: string) => path.relative(path.join(dir, "Fotos"), p).split(path.sep).join("/");
    expect(result.media.map((m) => `${m.kind} ${rel(m.path)}`)).toEqual([
      "photo a.jpg",
      "photo b.JPEG",
      "photo c.png",
      "photo d.webp",
      "photo d2.JXL",
      "photo sub/deeper/e.Jpg",
      "video v.3gp",
      "video v.MP4",
      "video v.m4v",
      "video v.mkv",
      "video v.mov",
    ]);
    expect(result.tracks.map(rel)).toEqual(["track.FIT"]);
    expect(result.unsupported.map(rel)).toEqual(["README", "raw.CR3", "x.heic"]);
  });

  it("accepts files listed directly and doesn't list a file twice", async () => {
    const { dir, write } = await tempDir();
    const file = await write("Fotos/a.jpg");
    const track = await write("Tracks/hike.fit");
    const result = await discover([path.join(dir, "Fotos"), file, track, path.join(dir, "Fotos")]);
    expect(result.media.map((m) => m.path)).toEqual([file]);
    expect(result.tracks).toEqual([track]);
  });

  it("follows symlinked folders without looping", async () => {
    const { dir, write } = await tempDir();
    await write("Fotos/a.jpg");
    await symlink(path.join(dir, "Fotos"), path.join(dir, "Fotos", "loop"), "dir");
    const result = await discover([path.join(dir, "Fotos")]);
    expect(result.media).toHaveLength(1);
  });

  it("sorts NFD and NFC names alike", async () => {
    const { dir, write } = await tempDir();
    await write("Fotos/Café b.jpg");
    await write("Fotos/Café a.jpg");
    const result = await discover([path.join(dir, "Fotos")]);
    expect(result.media.map((m) => path.basename(m.path).normalize("NFC"))).toEqual([
      "Café a.jpg",
      "Café b.jpg",
    ]);
  });
});

describe("isIgnored", () => {
  it.each([
    ".hidden.jpg",
    ".DS_Store",
    ".trashed-123-IMG.jpg",
    ".thumbnails",
    "Thumbs.db",
    "thumbs.db",
  ])("ignores %s", (name) => expect(isIgnored(name)).toBe(true));
  it("keeps normal names", () => expect(isIgnored("IMG_1.jpg")).toBe(false));
});

describe("classify", () => {
  it("is case-insensitive", () => {
    expect(classify("A.JPG")).toBe("photo");
    expect(classify("A.MoV")).toBe("video");
    expect(classify("A.Fit")).toBe("track");
    expect(classify("A.heic")).toBeUndefined();
  });
});

describe("summarizeUnsupported", () => {
  it("counts by lower-cased extension", () => {
    expect(summarizeUnsupported(["/a/x.HEIC", "/a/y.heic", "/a/n.txt", "/a/README"])).toBe(
      "(no extension) ×1, .heic ×2, .txt ×1",
    );
  });
});
