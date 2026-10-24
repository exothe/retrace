import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Trip, TripIndex } from "@retrace/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSampleMedia } from "../../../../examples/scripts/generate-media.ts";
import { ExitCode } from "../exit-codes.ts";
import { silentOutput } from "../output.ts";
import { useTempDir } from "../test/temp-dir.ts";
import { runBuild } from "./build.ts";
import { runIndex } from "./index-command.ts";

const EXAMPLE = path.resolve(import.meta.dirname, "../../../../examples/lissabon-2026");
const hasFfmpeg = await promisify(execFile)("ffmpeg", ["-version"]).then(
  () => true,
  () => false,
);

const tempDir = useTempDir();

/** Path, size, mtime and content of every file below `dir`. */
async function snapshot(dir: string) {
  const files = await readdir(dir, { recursive: true, withFileTypes: true });
  const result: Record<string, string> = {};
  for (const f of files.filter((e) => e.isFile())) {
    const full = path.join(f.parentPath, f.name);
    const info = await stat(full);
    result[path.relative(dir, full)] =
      `${info.size} ${info.mtimeMs} ${(await readFile(full)).toString("base64")}`;
  }
  return result;
}

describe.runIf(hasFfmpeg)("build (end to end, sample trip)", () => {
  // Generated once for all tests; useTempDir() folders are removed after each test.
  let media: string;
  beforeAll(async () => {
    media = await mkdtemp(path.join(os.tmpdir(), "retrace-media-"));
    await generateSampleMedia(media);
  }, 60_000);
  afterAll(() => rm(media, { recursive: true, force: true }));

  async function setup() {
    const { dir, write } = await tempDir();
    await cp(path.join(EXAMPLE, "Lissabon 2026.md"), path.join(dir, "trip", "Lissabon 2026.md"));
    const config = JSON.parse(
      await readFile(path.join(EXAMPLE, "trip.config.json"), "utf8"),
    ) as Record<string, unknown>;
    Object.assign(config, {
      media: [path.join(media, "Fotos"), path.join(media, "Videos")],
      tracks: [path.join(media, "Tracks")],
      output: "../site",
      cacheDir: "../cache",
    });
    const configFile = await write("trip/trip.config.json", JSON.stringify(config, null, 2));
    await write("viewer/index.html", "<!doctype html><title>Retrace</title>");
    await write("viewer/assets/index-abc.js", "console.log('viewer')");
    const lines: string[] = [];
    const out = { log: (line: string) => lines.push(line), progress: () => {} };
    const build = (extra = {}) =>
      runBuild(configFile, { viewerDir: path.join(dir, "viewer"), ...extra }, out);
    return { dir, site: path.join(dir, "site"), configFile, lines, build };
  }

  it("builds the trip, and a second run hits the cache and changes nothing", async () => {
    const { site, lines, build } = await setup();
    expect(await build()).toBe(ExitCode.Success);
    expect(lines.at(-1)).toMatch(
      /^Built lissabon-2026: 4 days, 9 entries, 10 photos, 2 videos, 1 track, 3 warnings, [\d.]+ KB in /,
    );
    expect(lines).toContain("Media: 12 processed, 0 from cache");

    const trip = JSON.parse(
      await readFile(path.join(site, "trips/lissabon-2026/trip.json"), "utf8"),
    ) as Trip;
    expect(trip.days.map((d) => [d.date, d.hasNotes])).toEqual([
      ["2026-10-22", false],
      ["2026-10-23", true],
      ["2026-10-24", true],
      ["2026-10-25", true],
    ]);
    const bar = trip.days[2]!.entries.find((e) => e.time === "23:40")!;
    expect(bar.items.map((i) => trip.media[i.id]!.localTime)).toEqual(["23:45", "00:20"]);
    const cover = trip.media[trip.cover!]!;
    expect(cover).toMatchObject({ type: "photo", localTime: "09:15" });

    // Every referenced file exists, and nothing else is in media/.
    const referenced = Object.values(trip.media).flatMap((m) =>
      m.type === "photo" ? [m.thumb, m.display] : [m.src, m.poster, m.posterThumb],
    );
    const onDisk = (await readdir(path.join(site, "trips/lissabon-2026/media"))).map(
      (f) => `media/${f}`,
    );
    expect(onDisk.sort()).toEqual(referenced.sort());

    const index = JSON.parse(
      await readFile(path.join(site, "trips/index.json"), "utf8"),
    ) as TripIndex;
    expect(index.trips).toEqual([
      expect.objectContaining({
        slug: "lissabon-2026",
        dayCount: 4,
        photoCount: 10,
        videoCount: 2,
      }),
    ]);
    expect(await readFile(path.join(site, "index.html"), "utf8")).toContain("Retrace");

    const before = await snapshot(site);
    lines.length = 0;
    expect(await build()).toBe(ExitCode.Success);
    expect(lines).toContain("Media: 0 processed, 12 from cache");
    expect(await snapshot(site)).toEqual(before);
  }, 120_000);

  it("stops before writing anything on errors, and fails on warnings with --strict", async () => {
    const { dir, site, lines, build } = await setup();
    expect(await build({ strict: true })).toBe(ExitCode.ValidationError);
    expect(lines.at(-1)).toBe("Build stopped, nothing was written.");
    await expect(stat(site)).rejects.toThrow();

    await writeFile(path.join(dir, "trip", "Lissabon 2026.md"), "# Verlauf\n* [08:00] no day\n");
    expect(await build()).toBe(ExitCode.ValidationError);
    await expect(stat(site)).rejects.toThrow();
  }, 60_000);

  it("removes media that the trip no longer references", async () => {
    const { configFile, site, build } = await setup();
    expect(await build()).toBe(ExitCode.Success);
    const config = JSON.parse(await readFile(configFile, "utf8")) as { media: string[] };
    config.media = [path.join(media, "Videos")];
    await writeFile(configFile, JSON.stringify(config));
    expect(await build()).toBe(ExitCode.Success);
    const files = await readdir(path.join(site, "trips/lissabon-2026/media"));
    expect(files.filter((f) => f.endsWith(".mp4"))).toHaveLength(2);
    expect(files).toHaveLength(6);
  }, 120_000);

  it("rebuilds index.json with retrace index", async () => {
    const { site, build } = await setup();
    expect(await build()).toBe(ExitCode.Success);
    await writeFile(path.join(site, "trips/index.json"), "{}");
    expect(await runIndex(site, {}, silentOutput)).toBe(ExitCode.Success);
    const index = JSON.parse(
      await readFile(path.join(site, "trips/index.json"), "utf8"),
    ) as TripIndex;
    expect(index.trips.map((t) => t.slug)).toEqual(["lissabon-2026"]);
  }, 120_000);
});
