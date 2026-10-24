import { mkdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultCacheDir, formatKeyPath, isInside, loadConfig, parseOffset } from "./config.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { useTempDir } from "./test/temp-dir.ts";

const tempDir = useTempDir();

const MINIMAL = {
  title: "Lissabon 2026",
  slug: "lissabon-2026",
  timezone: "Europe/Lisbon",
  notes: "./Lissabon 2026.md",
  media: ["./Fotos"],
  output: "../site",
};

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

/** 1-based line of the first occurrence of `needle` in `text`. */
const lineOf = (text: string, needle: string) => {
  const index = text.indexOf(needle);
  if (index < 0) throw new Error(`"${needle}" not in config text`);
  return text.slice(0, index).split("\n").length;
};

/** Writes a trip folder with notes and a Fotos folder, plus the given config text. */
async function setup(configText: string) {
  const temp = await tempDir();
  await temp.write("trip/Lissabon 2026.md", "# Verlauf\n");
  await temp.folder("trip/Fotos");
  const file = await temp.write("trip/trip.json", configText);
  return { ...temp, file, tripDir: path.dirname(file) };
}

const messages = (diagnostics: Diagnostic[]) =>
  diagnostics.map((d) => `${d.line ?? "-"}: ${d.severity}: ${d.message}`);

describe("loadConfig", () => {
  it("applies defaults and resolves paths relative to the config file", async () => {
    const { file, tripDir, dir } = await setup(json(MINIMAL));
    const { config, diagnostics } = await loadConfig(file);
    expect(diagnostics).toEqual([]);
    expect(config).toEqual({
      configFile: file,
      title: "Lissabon 2026",
      slug: "lissabon-2026",
      timezone: "Europe/Lisbon",
      notes: path.join(tripDir, "Lissabon 2026.md"),
      media: [path.join(tripDir, "Fotos")],
      tracks: [],
      output: path.join(dir, "site"),
      cacheDir: defaultCacheDir(),
      ffmpegPath: "ffmpeg",
      ffprobePath: "ffprobe",
      djxlPath: "djxl",
      cameraOffsets: {},
      videoTimesAreUtc: true,
      images: { thumbWidth: 400, displayWidth: 1920, quality: 50 },
      videos: { maxShortSide: 720, crf: 44, preset: 6, audioBitrate: "128k" },
      trackOptions: { simplifyToleranceMeters: 5, geotagToleranceMinutes: 2 },
    });
  });

  it("reads all options", async () => {
    const { file, tripDir } = await setup(
      json({
        ...MINIMAL,
        tracks: "./Tracks",
        cover: "IMG_1.jpg",
        cacheDir: "../cache",
        ffmpegPath: "./bin/ffmpeg",
        ffprobePath: "/usr/local/bin/ffprobe",
        djxlPath: "djxl.exe",
        cameraOffsets: { " Canon EOS R6 ": "-00:02:30", "Pixel 8": "+1:00" },
        videoTimesAreUtc: false,
        images: { thumbWidth: 300, quality: 80 },
        videos: { maxShortSide: 1080, crf: 30, preset: 4, audioBitrate: "96k" },
        tracks_options: { simplifyToleranceMeters: 10 },
      }),
    );
    await mkdir(path.join(tripDir, "Tracks"));

    const { config, diagnostics } = await loadConfig(file);
    expect(diagnostics).toEqual([]);
    expect(config).toMatchObject({
      tracks: [path.join(tripDir, "Tracks")],
      cover: "IMG_1.jpg",
      cacheDir: path.join(path.dirname(tripDir), "cache"),
      ffmpegPath: path.join(tripDir, "bin", "ffmpeg"),
      ffprobePath: path.resolve(tripDir, "/usr/local/bin/ffprobe"),
      djxlPath: "djxl.exe",
      cameraOffsets: { "Canon EOS R6": -150, "Pixel 8": 3600 },
      videoTimesAreUtc: false,
      images: { thumbWidth: 300, displayWidth: 1920, quality: 80 },
      videos: { maxShortSide: 1080, crf: 30, preset: 4, audioBitrate: "96k" },
      trackOptions: { simplifyToleranceMeters: 10, geotagToleranceMinutes: 2 },
    });
  });

  it("accepts a single path instead of a list for media", async () => {
    const { file, tripDir } = await setup(json({ ...MINIMAL, media: "./Fotos" }));
    const { config } = await loadConfig(file);
    expect(config?.media).toEqual([path.join(tripDir, "Fotos")]);
  });

  it("handles a BOM and CRLF line endings", async () => {
    const { file } = await setup("﻿" + json(MINIMAL).replaceAll("\n", "\r\n"));
    expect((await loadConfig(file)).diagnostics).toEqual([]);
  });

  it("reports missing required keys", async () => {
    const { file } = await setup(json({ title: "X" }));
    const { config, diagnostics } = await loadConfig(file);
    expect(config).toBeUndefined();
    expect(messages(diagnostics)).toEqual([
      "-: error: slug: is required",
      "-: error: timezone: is required",
      "-: error: notes: is required",
      "-: error: media: is required",
      "-: error: output: is required",
    ]);
    expect(diagnostics[0]?.file).toBe(file);
  });

  it("reports invalid values with the offending key and its line", async () => {
    const text = json({
      ...MINIMAL,
      slug: "Lissabon 2026",
      timezone: "Europe/Lisboa",
      images: { quality: 101 },
      videos: { preset: "medium" },
      cameraOffsets: { "Canon EOS R6": "2 minutes" },
      media: ["./Fotos", " "],
    });
    const { file } = await setup(text);
    expect(messages((await loadConfig(file)).diagnostics)).toEqual([
      `${lineOf(text, '"slug"')}: error: slug: must only contain a-z, 0-9 and -`,
      `${lineOf(text, '"timezone"')}: error: timezone: must be an IANA timezone like Europe/Lisbon`,
      `${lineOf(text, '" "')}: error: media[1]: must not be empty`,
      expect.stringMatching(
        new RegExp(`^${lineOf(text, '"quality"')}: error: images\\.quality: .*100`),
      ),
      expect.stringMatching(
        new RegExp(
          `^${lineOf(text, '"preset"')}: error: videos\\.preset: must be an SVT-AV1 preset from 0 \\(slowest\\) to 13 \\(fastest\\)$`,
        ),
      ),
      `${lineOf(text, '"Canon EOS R6"')}: error: cameraOffsets."Canon EOS R6": must be an offset like "-00:02:30"`,
    ]);
  });

  it("reports unknown keys, including typos in nested options", async () => {
    const text = json({ ...MINIMAL, track_options: {}, images: { qualty: 80 } });
    const { file } = await setup(text);
    expect(messages((await loadConfig(file)).diagnostics)).toEqual([
      `${lineOf(text, '"track_options"')}: error: track_options: unknown key`,
      `${lineOf(text, '"qualty"')}: error: images.qualty: unknown key`,
    ]);
  });

  it("reports wrong types", async () => {
    const text = json({ ...MINIMAL, videoTimesAreUtc: "yes" });
    const { file } = await setup(text);
    expect(messages((await loadConfig(file)).diagnostics)).toEqual([
      expect.stringMatching(
        new RegExp(`^${lineOf(text, '"videoTimesAreUtc"')}: error: videoTimesAreUtc: .*boolean`),
      ),
    ]);
  });

  it("reports an empty media list", async () => {
    const text = json({ ...MINIMAL, media: [] });
    const { file } = await setup(text);
    expect(messages((await loadConfig(file)).diagnostics)).toEqual([
      expect.stringMatching(new RegExp(`^${lineOf(text, '"media"')}: error: media: `)),
    ]);
  });

  it("reports JSON syntax errors with their line", async () => {
    const { file } = await setup('{\n  "title": "X",\n  "slug": [\n}\n');
    const { diagnostics } = await loadConfig(file);
    expect(diagnostics[0]).toMatchObject({ severity: "error", file, line: 4 });
    expect(diagnostics[0]?.message).toBe("invalid JSON: value expected");
  });

  it("rejects comments", async () => {
    const { file } = await setup('{\n  // comment\n  "title": "X"\n}\n');
    expect(messages((await loadConfig(file)).diagnostics)).toEqual([
      "2: error: invalid JSON: invalid comment token",
    ]);
  });

  it("rejects trailing commas", async () => {
    const { file } = await setup('{\n  "title": "X",\n}\n');
    expect(messages((await loadConfig(file)).diagnostics)).toEqual([
      "3: error: invalid JSON: property name expected",
    ]);
  });

  it("reports duplicate keys", async () => {
    const text = json(MINIMAL).replace("{", '{\n  "title": "Again",');
    const { file } = await setup(text);
    expect(messages((await loadConfig(file)).diagnostics)).toEqual([
      `3: error: invalid JSON: duplicate key "title"`,
    ]);
  });

  it("reports a document that isn't an object", async () => {
    const { file } = await setup('["a", "b"]\n');
    expect(messages((await loadConfig(file)).diagnostics)).toEqual([
      expect.stringMatching(/^1: error: config must be a JSON object/),
    ]);
  });

  it("reports an empty file", async () => {
    const { file } = await setup("");
    expect(messages((await loadConfig(file)).diagnostics)).toEqual([
      "1: error: invalid JSON: value expected",
    ]);
  });

  it("reports a missing config file", async () => {
    const { dir } = await tempDir();
    const { diagnostics } = await loadConfig(path.join(dir, "nope.json"));
    expect(diagnostics[0]?.message).toMatch(/^cannot read config file: /);
  });

  it("reports notes, media and track paths that don't exist", async () => {
    const text = json({
      ...MINIMAL,
      notes: "./Fehlt.md",
      media: ["./Fotos", "./Videos"],
      tracks: "./Tracks",
    });
    const { file } = await setup(text);
    expect(messages((await loadConfig(file)).diagnostics)).toEqual([
      expect.stringMatching(
        new RegExp(`^${lineOf(text, '"notes"')}: error: notes: file not found: .*Fehlt\\.md$`),
      ),
      expect.stringMatching(
        new RegExp(`^${lineOf(text, '"./Videos"')}: error: media\\[1\\]: not found: .*Videos$`),
      ),
      expect.stringMatching(
        new RegExp(`^${lineOf(text, '"tracks"')}: error: tracks: not found: .*Tracks$`),
      ),
    ]);
  });

  it("reports a notes path that is a folder", async () => {
    const text = json({ ...MINIMAL, notes: "./Fotos" });
    const { file } = await setup(text);
    expect(messages((await loadConfig(file)).diagnostics)).toEqual([
      expect.stringMatching(new RegExp(`^${lineOf(text, '"notes"')}: error: notes: not a file: `)),
    ]);
  });

  it("rejects a cache directory inside the notes folder", async () => {
    const text = json({ ...MINIMAL, cacheDir: "./.cache" });
    const { file } = await setup(text);
    expect(messages((await loadConfig(file)).diagnostics)).toEqual([
      `${lineOf(text, '"cacheDir"')}: error: cacheDir: must not be inside the notes folder, which is synced`,
    ]);
  });
});

describe("defaultCacheDir", () => {
  it("is an absolute OS cache path for retrace", () => {
    expect(path.isAbsolute(defaultCacheDir())).toBe(true);
    expect(path.basename(defaultCacheDir())).toBe("retrace");
  });
});

describe("parseOffset", () => {
  it.each([
    ["-00:02:30", -150],
    ["+01:00", 3600],
    ["1:00:05", 3605],
    ["00:00", 0],
    ["-25:00:00", -90000],
  ])("parses %s", (text, seconds) => {
    expect(parseOffset(text)).toBe(seconds);
  });

  it.each(["", "2m", "1:60", "1:00:60", "--1:00"])("rejects %s", (text) => {
    expect(() => parseOffset(text)).toThrow();
  });
});

describe("formatKeyPath", () => {
  it("formats nested keys, indices and keys that need quoting", () => {
    expect(formatKeyPath(["images", "quality"])).toBe("images.quality");
    expect(formatKeyPath(["tracks_options", 0, "x"])).toBe("tracks_options[0].x");
    expect(formatKeyPath(["cameraOffsets", "Canon EOS R6"])).toBe('cameraOffsets."Canon EOS R6"');
  });
});

describe("isInside", () => {
  it("detects paths inside a folder", () => {
    const root = path.resolve("/vault");
    expect(isInside(path.join(root, "a", "b"), root)).toBe(true);
    expect(isInside(root, root)).toBe(true);
    expect(isInside(path.resolve("/vault2"), root)).toBe(false);
    expect(isInside(path.resolve("/other"), root)).toBe(false);
  });
});
