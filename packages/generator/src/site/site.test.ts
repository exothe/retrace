import { mkdir, readFile, readdir, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Trip } from "@retrace/shared";
import { describe, expect, it } from "vitest";
import type { ProcessedMedia } from "../process/process-media.ts";
import { useTempDir } from "../test/temp-dir.ts";
import { rebuildIndex, summarizeTrip } from "./index-json.ts";
import { writeJsonIfChanged } from "./json.ts";
import { writeTripFolder } from "./trip-folder.ts";
import { ViewerMissingError, copyViewer } from "./viewer.ts";

const tempDir = useTempDir();

function trip(slug: string, startDate: string, extra: Partial<Trip> = {}): Trip {
  return {
    schemaVersion: 1,
    generatedAt: "2026-11-01T00:00:00Z",
    slug,
    title: slug,
    timezone: "Europe/Lisbon",
    startDate,
    endDate: startDate,
    days: [{ date: startDate, hasNotes: true, before: [], entries: [], mapMediaIds: [] }],
    media: {},
    tracks: {},
    ...extra,
  };
}

describe("writeJsonIfChanged", () => {
  it("doesn't rewrite a file whose data only differs in generatedAt", async () => {
    const { dir } = await tempDir();
    const file = path.join(dir, "x.json");
    expect(await writeJsonIfChanged(file, { generatedAt: "a", n: 1 }, { pretty: false })).toBe(
      true,
    );
    expect(await writeJsonIfChanged(file, { generatedAt: "b", n: 1 }, { pretty: false })).toBe(
      false,
    );
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ generatedAt: "a", n: 1 });
    expect(await writeJsonIfChanged(file, { generatedAt: "c", n: 2 }, { pretty: true })).toBe(true);
    expect(await readFile(file, "utf8")).toBe('{\n  "generatedAt": "c",\n  "n": 2\n}\n');
  });
});

describe("writeTripFolder", () => {
  it("copies media from the cache, removes stale files and skips unchanged ones", async () => {
    const { dir, write } = await tempDir();
    const site = path.join(dir, "site");
    const thumb = await write("cache/thumb.webp", "T");
    const display = await write("cache/display.webp", "D");
    const stale = await write("site/trips/t/media/old000000000-thumb.webp", "old");
    const processed = [
      { item: { id: "abc123def456" }, type: "photo", files: { thumb, display } },
    ] as unknown as ProcessedMedia[];

    const first = await writeTripFolder(site, trip("t", "2026-10-23"), processed);
    expect(first).toEqual({ copied: 2, removed: 1, tripJsonWritten: true });
    expect((await readdir(path.join(site, "trips/t/media"))).sort()).toEqual([
      "abc123def456-display.webp",
      "abc123def456-thumb.webp",
    ]);
    await expect(stat(stale)).rejects.toThrow();

    expect(await writeTripFolder(site, trip("t", "2026-10-23"), processed)).toEqual({
      copied: 0,
      removed: 0,
      tripJsonWritten: false,
    });

    // A new cache version of the same file (e.g. other quality) is copied again.
    await writeFile(thumb, "U");
    const later = new Date(Date.now() + 5000);
    await utimes(thumb, later, later);
    expect((await writeTripFolder(site, trip("t", "2026-10-23"), processed)).copied).toBe(1);
    expect(await readFile(path.join(site, "trips/t/media/abc123def456-thumb.webp"), "utf8")).toBe(
      "U",
    );
  });
});

describe("copyViewer", () => {
  it("copies the build, removes old assets and never touches trips/", async () => {
    const { dir, write } = await tempDir();
    const viewer = path.join(dir, "dist");
    const site = path.join(dir, "site");
    await write("dist/index.html", "<html>new</html>");
    await write("dist/assets/index-new.js", "js");
    await write("dist/trips/should-not-be-copied.json", "{}");
    await write("site/index.html", "<html>old</html>");
    await write("site/assets/index-old.js", "old js");
    await write("site/trips/index.json", "{}");
    await write("site/trips/a/trip.json", "{}");

    expect(await copyViewer(viewer, site)).toEqual({ copied: 2, removed: 1 });
    expect(await readFile(path.join(site, "index.html"), "utf8")).toBe("<html>new</html>");
    expect(await readdir(path.join(site, "assets"))).toEqual(["index-new.js"]);
    expect((await readdir(path.join(site, "trips"))).sort()).toEqual(["a", "index.json"]);
    expect(await copyViewer(viewer, site)).toEqual({ copied: 0, removed: 0 });
  });

  it("fails with a build hint if the viewer isn't built", async () => {
    const { dir } = await tempDir();
    await expect(copyViewer(path.join(dir, "nope"), dir)).rejects.toThrow(ViewerMissingError);
    await expect(copyViewer(path.join(dir, "nope"), dir)).rejects.toThrow(
      "npm run build -w viewer",
    );
  });
});

describe("rebuildIndex", () => {
  it("lists all trips newest first, with cover paths relative to the site root", async () => {
    const { dir, write } = await tempDir();
    const cover = {
      id: "abc",
      type: "photo",
      takenAt: "",
      localTime: "",
      width: 1,
      height: 1,
      color: "#123456",
      thumb: "media/abc-thumb.webp",
      display: "media/abc-display.webp",
    } as const;
    await write("trips/old/trip.json", JSON.stringify(trip("old", "2024-05-01")));
    await write(
      "trips/new/trip.json",
      JSON.stringify(trip("new", "2026-10-22", { cover: "abc", media: { abc: cover } })),
    );
    await write("trips/broken/trip.json", "{");
    await write(
      "trips/future/trip.json",
      JSON.stringify({ ...trip("future", "2027-01-01"), schemaVersion: 2 }),
    );
    await mkdir(path.join(dir, "trips", "empty"));

    const { index, written, diagnostics } = await rebuildIndex(dir, "2026-11-01T00:00:00.000Z");
    expect(written).toBe(true);
    expect(index.trips.map((t) => t.slug)).toEqual(["new", "old"]);
    expect(index.trips[0]).toEqual({
      slug: "new",
      title: "new",
      startDate: "2026-10-22",
      endDate: "2026-10-22",
      dayCount: 1,
      photoCount: 1,
      videoCount: 0,
      cover: {
        thumb: "trips/new/media/abc-thumb.webp",
        display: "trips/new/media/abc-display.webp",
        color: "#123456",
      },
    });
    expect(diagnostics.map((d) => `${path.basename(path.dirname(d.file!))}: ${d.message}`)).toEqual(
      [
        "broken: missing or unreadable, not listed in index.json",
        "empty: missing or unreadable, not listed in index.json",
        "future: schemaVersion 2 is not supported, not listed in index.json",
      ],
    );
    expect(JSON.parse(await readFile(path.join(dir, "trips/index.json"), "utf8"))).toEqual(index);
    expect((await rebuildIndex(dir)).written).toBe(false);
  });

  it("uses the poster for a video cover", () => {
    const summary = summarizeTrip(
      trip("t", "2026-10-22", {
        cover: "v",
        media: {
          v: {
            id: "v",
            type: "video",
            takenAt: "",
            localTime: "",
            width: 1,
            height: 1,
            src: "media/v.mp4",
            poster: "media/v-poster.webp",
            posterThumb: "media/v-poster-thumb.webp",
            durationSeconds: 1,
          },
        },
      }),
    );
    expect(summary.cover).toEqual({
      thumb: "trips/t/media/v-poster-thumb.webp",
      display: "trips/t/media/v-poster.webp",
    });
    expect(summary.videoCount).toBe(1);
  });
});
