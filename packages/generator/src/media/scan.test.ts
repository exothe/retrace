import { utimes } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Cache } from "../cache.ts";
import type { TripConfig } from "../config.ts";
import { silentOutput } from "../output.ts";
import { useTempDir } from "../test/temp-dir.ts";
import type { MetadataReader, RawMetadata } from "./metadata.ts";
import { scanMedia, toGps, toTexts } from "./scan.ts";

const tempDir = useTempDir();

/** A fake exiftool: metadata keyed by file name. */
function fakeReader(byName: Record<string, RawMetadata>) {
  const read = vi.fn(async (file: string) => byName[path.basename(file)] ?? {});
  const reader: MetadataReader = { read, close: async () => {} };
  return { reader, read };
}

async function setup() {
  const temp = await tempDir();
  const config = {
    configFile: path.join(temp.dir, "trip.config.json"),
    timezone: "Europe/Lisbon",
    videoTimesAreUtc: true,
    cameraOffsets: { "Canon EOS R6": -150, "Unused Cam": 10 },
    media: [path.join(temp.dir, "Fotos")],
    tracks: [],
    cacheDir: path.join(temp.dir, "cache"),
  } as unknown as TripConfig;
  return { ...temp, config };
}

describe("scanMedia", () => {
  it("resolves timestamps, sorts by time and reports duplicates, mtime fallbacks and unused offsets", async () => {
    const { write, config } = await setup();
    await write("Fotos/b.jpg", "same");
    await write("Fotos/a-copy.jpg", "same");
    await write("Fotos/canon.jpg", "canon");
    await write("Fotos/IMG_20261023_080000.jpg", "named");
    const undated = await write("Fotos/undated.jpg", "undated");
    await utimes(undated, new Date("2026-10-25T15:00:00Z"), new Date("2026-10-25T15:00:00Z"));
    await write("Fotos/clip.mov", "video");
    await write("Fotos/notes.txt", "x");
    await write("Tracks/../Fotos/hike.fit", "fit");

    const { reader } = fakeReader({
      "a-copy.jpg": { dateTimeOriginal: "2026:10:23 09:00:00", gpsLatitude: 0, gpsLongitude: 0 },
      "canon.jpg": {
        dateTimeOriginal: "2026:10:24 10:32:30",
        make: "Canon",
        model: "Canon EOS R6",
        gpsLatitude: 38.7,
        gpsLongitude: -9.1,
      },
      "clip.mov": { quickTimeCreateDate: "2026:10:23 07:30:00" },
    });
    const cache = await Cache.open(config.cacheDir);
    const scan = await scanMedia(config, { cache, out: silentOutput, reader });

    expect(
      scan.media.map((m) => [path.basename(m.path), m.kind, m.takenAt.toISO(), m.timestampSource]),
    ).toEqual([
      ["IMG_20261023_080000.jpg", "photo", "2026-10-23T07:00:00.000Z", "filename"],
      ["clip.mov", "video", "2026-10-23T07:30:00.000Z", "quicktime"],
      ["a-copy.jpg", "photo", "2026-10-23T08:00:00.000Z", "exif-local"],
      ["canon.jpg", "photo", "2026-10-24T09:30:00.000Z", "exif-local"],
      ["undated.jpg", "photo", "2026-10-25T15:00:00.000Z", "mtime"],
    ]);
    const copy = scan.media[2]!;
    expect(copy.duplicates.map((p) => path.basename(p))).toEqual(["b.jpg"]);
    expect(copy.id).toBe(copy.hash.slice(0, 12));
    expect(copy.gps).toBeUndefined(); // 0,0 is ignored
    expect(scan.media[3]).toMatchObject({
      gps: { lat: 38.7, lon: -9.1 },
      camera: "Canon Canon EOS R6",
      cameraOffsetKey: "Canon EOS R6",
    });
    expect(scan.tracks.map((p) => path.basename(p))).toEqual(["hike.fit"]);
    expect(scan.unsupported.map((p) => path.basename(p))).toEqual(["notes.txt"]);
    expect(
      scan.diagnostics.map((d) => `${path.basename(d.file!)}: ${d.severity}: ${d.message}`),
    ).toEqual([
      expect.stringMatching(
        /^a-copy\.jpg: warning: identical files, using this one and skipping: .*b\.jpg$/,
      ),
      "undated.jpg: warning: no timestamp in metadata or file name, using the file modification time",
      'trip.config.json: warning: cameraOffsets: "Unused Cam" matches no photo or video',
    ]);
  });

  it("caches metadata by content hash and re-reads it with the cache disabled", async () => {
    const { write, config } = await setup();
    await write("Fotos/a.jpg", "a");
    await write("Fotos/b.jpg", "b");
    const first = fakeReader({ "a.jpg": { dateTimeOriginal: "2026:10:23 09:00:00" } });
    await scanMedia(config, {
      cache: await Cache.open(config.cacheDir),
      out: silentOutput,
      reader: first.reader,
    });
    expect(first.read).toHaveBeenCalledTimes(2);

    const second = fakeReader({});
    const scan = await scanMedia(config, {
      cache: await Cache.open(config.cacheDir),
      out: silentOutput,
      reader: second.reader,
    });
    expect(second.read).not.toHaveBeenCalled();
    expect(scan.media.find((m) => m.path.endsWith("a.jpg"))?.timestampSource).toBe("exif-local");

    // A changed file is re-hashed and re-read.
    await write("Fotos/b.jpg", "b changed");
    const third = fakeReader({});
    await scanMedia(config, {
      cache: await Cache.open(config.cacheDir),
      out: silentOutput,
      reader: third.reader,
    });
    expect(third.read.mock.calls.map(([file]) => path.basename(file))).toEqual(["b.jpg"]);

    const uncached = fakeReader({});
    await scanMedia(config, {
      cache: await Cache.open(config.cacheDir, { enabled: false }),
      out: silentOutput,
      reader: uncached.reader,
    });
    expect(uncached.read).toHaveBeenCalledTimes(2);
  });

  it("warns about files exiftool can't read", async () => {
    const { write, config } = await setup();
    await write("Fotos/IMG_20261023_080000.jpg", "x");
    const { reader } = fakeReader({ "IMG_20261023_080000.jpg": { error: "File format error" } });
    const scan = await scanMedia(config, {
      cache: await Cache.open(config.cacheDir),
      out: silentOutput,
      reader,
    });
    expect(scan.diagnostics.map((d) => d.message)).toContain(
      "cannot read metadata: File format error",
    );
  });
});

describe("toGps", () => {
  it("ignores missing, 0,0 and out-of-range positions", () => {
    expect(toGps({ gpsLatitude: 38.7, gpsLongitude: -9.1 })).toEqual({ lat: 38.7, lon: -9.1 });
    expect(toGps({ gpsLatitude: 0, gpsLongitude: 0 })).toBeUndefined();
    expect(toGps({ gpsLatitude: 0, gpsLongitude: 5 })).toEqual({ lat: 0, lon: 5 });
    expect(toGps({ gpsLatitude: 38.7 })).toBeUndefined();
    expect(toGps({ gpsLatitude: 91, gpsLongitude: 0 })).toBeUndefined();
  });
});

describe("toTexts", () => {
  it("trims title and caption and drops a caption equal to the title", () => {
    expect(toTexts({ title: " Alfama ", caption: "Blick\r\nvom Miradouro\n" })).toEqual({
      title: "Alfama",
      caption: "Blick\nvom Miradouro",
    });
    expect(toTexts({ title: "Alfama", caption: "Alfama" })).toEqual({ title: "Alfama" });
    expect(toTexts({ title: "  " })).toEqual({});
  });

  it("ignores camera placeholders and the camera make or model", () => {
    expect(toTexts({ caption: "OLYMPUS DIGITAL CAMERA" })).toEqual({});
    expect(toTexts({ caption: "sony dsc" })).toEqual({});
    expect(toTexts({ make: "SAMSUNG", caption: "SAMSUNG" })).toEqual({});
    expect(toTexts({ model: "Pixel 8", title: "Pixel 8", caption: "Sintra" })).toEqual({
      caption: "Sintra",
    });
  });
});
