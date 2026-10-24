import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import type { MediaItem } from "../media/scan.ts";
import { parseNotes } from "../notes/parse.ts";
import type { ProcessedMedia } from "../process/process-media.ts";
import { geotag } from "../tracks/geotag.ts";
import type { LoadedTrack } from "../tracks/load.ts";
import { assembleTrip, entryIndexFor } from "./assemble.ts";

const ZONE = "Europe/Lisbon";
let counter = 0;

function photo(local: string, extra: Partial<MediaItem> = {}): ProcessedMedia {
  const id = `p${String(++counter).padStart(11, "0")}`;
  return {
    item: {
      id,
      takenAt: DateTime.fromISO(local, { zone: ZONE }).toUTC(),
      kind: "photo",
      ...extra,
    } as MediaItem,
    type: "photo",
    files: { thumb: "/cache/t.avif", display: "/cache/d.avif" },
    info: { width: 1920, height: 1440, color: "#102030" },
  };
}

function video(local: string): ProcessedMedia {
  const id = `v${String(++counter).padStart(11, "0")}`;
  return {
    item: {
      id,
      takenAt: DateTime.fromISO(local, { zone: ZONE }).toUTC(),
      kind: "video",
    } as MediaItem,
    type: "video",
    files: { video: "/c/v.mp4", poster: "/c/p.avif", posterThumb: "/c/pt.avif" },
    info: { width: 640, height: 360, color: "#000000", durationSeconds: 3.4 },
  };
}

const assemble = (
  notes: string,
  media: ProcessedMedia[],
  cover?: string,
  tracks: LoadedTrack[] = [],
) =>
  assembleTrip({
    slug: "lissabon-2026",
    title: "Lissabon 2026",
    timezone: ZONE,
    days: parseNotes(notes).days,
    media,
    tracks,
    ...geotag(
      media.map((p) => p.item),
      tracks,
      2,
    ),
    ...(cover !== undefined && { cover }),
    generatedAt: "2026-11-01T00:00:00.000Z",
  });

/** Day structure as readable strings: "<time> <text>: <item local times>" */
const outline = (trip: ReturnType<typeof assemble>) =>
  trip.days.map((day) => ({
    date: day.date,
    hasNotes: day.hasNotes,
    before: day.before.map((i) => trip.media[i.id]!.localTime),
    entries: day.entries.map((e) =>
      `${e.time} ${e.text}: ${e.items.map((i) => trip.media[i.id]!.localTime).join(" ")}`.trim(),
    ),
  }));

const NOTES = [
  "# Verlauf",
  "## 23.10.2026",
  "* [09:00] Stadt",
  "* [13:30] Essen",
  "## 24.10.2026",
  "* [23:40] Bar",
  "* [00:30] Hotel",
].join("\n");

describe("assembleTrip", () => {
  it("puts media under the latest entry at or before it, or in before", () => {
    const trip = assemble(NOTES, [
      photo("2026-10-23T13:30:00"),
      photo("2026-10-23T08:59:59"),
      photo("2026-10-23T09:00:00"),
      video("2026-10-23T10:00:00"),
      photo("2026-10-23T23:00:00"),
    ]);
    expect(outline(trip)[0]).toEqual({
      date: "2026-10-23",
      hasNotes: true,
      before: ["08:59"],
      entries: ["09:00 Stadt: 09:00 10:00", "13:30 Essen: 13:30 23:00"],
    });
  });

  it("keeps rolled-over media on the note day and adds media-only days", () => {
    const trip = assemble(NOTES, [
      photo("2026-10-25T00:20:00"),
      photo("2026-10-25T00:45:00"),
      photo("2026-10-22T18:30:00"),
      photo("2026-10-24T23:45:00"),
    ]);
    expect(outline(trip)).toEqual([
      { date: "2026-10-22", hasNotes: false, before: ["18:30"], entries: [] },
      { date: "2026-10-23", hasNotes: true, before: [], entries: ["09:00 Stadt:", "13:30 Essen:"] },
      {
        date: "2026-10-24",
        hasNotes: true,
        before: [],
        entries: ["23:40 Bar: 23:45 00:20", "00:30 Hotel:"],
      },
      { date: "2026-10-25", hasNotes: false, before: ["00:45"], entries: [] },
    ]);
    expect(trip.startDate).toBe("2026-10-22");
    expect(trip.endDate).toBe("2026-10-25");
  });

  it("writes entry ids, UTC timestamps and the times as written", () => {
    const trip = assemble(NOTES, []);
    expect(trip.days[1]!.entries).toEqual([
      {
        id: "2026-10-24-1",
        time: "23:40",
        timestamp: "2026-10-24T22:40:00Z",
        text: "Bar",
        items: [],
      },
      {
        id: "2026-10-24-2",
        time: "00:30",
        timestamp: "2026-10-24T23:30:00Z",
        text: "Hotel",
        items: [],
      },
    ]);
  });

  it("writes media records with relative paths, local times and GPS", () => {
    const p = photo("2026-10-23T09:15:12.250", { gps: { lat: 38.71140049, lon: -9.13049987 } });
    const v = video("2026-10-23T10:00:00");
    const trip = assemble(NOTES, [p, v], p.item.id);
    expect(trip.media[p.item.id]).toEqual({
      id: p.item.id,
      type: "photo",
      takenAt: "2026-10-23T08:15:12.250Z",
      localTime: "09:15",
      width: 1920,
      height: 1440,
      color: "#102030",
      gps: { lat: 38.7114, lon: -9.1305, source: "exif" },
      thumb: `media/${p.item.id}-thumb.avif`,
      display: `media/${p.item.id}-display.avif`,
    });
    expect(trip.media[v.item.id]).toMatchObject({
      type: "video",
      src: `media/${v.item.id}.mp4`,
      poster: `media/${v.item.id}-poster.avif`,
      posterThumb: `media/${v.item.id}-poster-thumb.avif`,
      durationSeconds: 3.4,
    });
    expect(trip.cover).toBe(p.item.id);
    expect(trip.days[0]!.mapMediaIds).toEqual([p.item.id]);
    expect(trip).toMatchObject({
      schemaVersion: 1,
      slug: "lissabon-2026",
      timezone: ZONE,
      tracks: {},
    });
  });

  it("sorts media within an entry by time", () => {
    const trip = assemble(NOTES, [photo("2026-10-23T11:00:00"), photo("2026-10-23T10:00:00")]);
    expect(outline(trip)[0]!.entries[0]).toBe("09:00 Stadt: 10:00 11:00");
  });
});

describe("assembleTrip with tracks", () => {
  const hike = {
    id: "t00000000001",
    path: "/t/hike.fit",
    start: DateTime.fromISO("2026-10-23T10:00:00", { zone: ZONE }).toUTC(),
    end: DateTime.fromISO("2026-10-23T12:30:00", { zone: ZONE }).toUTC(),
    records: [
      {
        t: DateTime.fromISO("2026-10-23T10:00:00", { zone: ZONE }).toMillis(),
        lat: 38.7,
        lon: -9.3,
        ele: 200,
        distance: 0,
      },
      {
        t: DateTime.fromISO("2026-10-23T12:30:00", { zone: ZONE }).toMillis(),
        lat: 38.8,
        lon: -9.4,
        ele: 400,
        distance: 5000,
      },
    ],
    processed: {
      sport: "hiking",
      stats: { distanceMeters: 5000, durationSeconds: 9000 },
      points: [
        [38.7, -9.3, 200, 0],
        [38.8, -9.4, 400, 9000],
      ],
      elevationProfile: [
        [0, 200],
        [5000, 400],
      ],
    },
  } as LoadedTrack;

  it("places a track among the media of its entry by start time, and geotags media", () => {
    const p1 = photo("2026-10-23T09:30:00");
    const p2 = photo("2026-10-23T11:15:00");
    const trip = assemble(NOTES, [p1, p2], undefined, [hike]);
    const entry = trip.days[0]!.entries[0]!;
    expect(entry.items).toEqual([
      { kind: "media", id: p1.item.id },
      { kind: "track", id: hike.id },
      { kind: "media", id: p2.item.id },
    ]);
    expect(trip.media[p2.item.id]!.gps).toEqual({ lat: 38.75, lon: -9.35, source: "track" });
    expect(trip.media[p1.item.id]!.gps).toBeUndefined();
    expect(trip.days[0]!.mapMediaIds).toEqual([p2.item.id]);
    expect(trip.tracks[hike.id]).toEqual({
      id: hike.id,
      start: "2026-10-23T09:00:00Z",
      end: "2026-10-23T11:30:00Z",
      localStart: "10:00",
      localEnd: "12:30",
      sport: "hiking",
      stats: { distanceMeters: 5000, durationSeconds: 9000 },
      points: [
        [38.7, -9.3, 200, 0],
        [38.8, -9.4, 400, 9000],
      ],
      elevationProfile: [
        [0, 200],
        [5000, 400],
      ],
      mediaIds: [p2.item.id],
    });
  });

  it("gives a track on a date without notes its own day", () => {
    const trip = assemble("# Verlauf\n## 24.10.2026\n* [09:00] A", [], undefined, [hike]);
    expect(trip.days.map((d) => [d.date, d.hasNotes, d.before])).toEqual([
      ["2026-10-23", false, [{ kind: "track", id: hike.id }]],
      ["2026-10-24", true, []],
    ]);
  });
});

describe("entryIndexFor", () => {
  it("picks the latest entry at or before the instant", () => {
    expect(entryIndexFor([10, 20, 30], 5)).toBeUndefined();
    expect(entryIndexFor([10, 20, 30], 10)).toBe(0);
    expect(entryIndexFor([10, 20, 30], 25)).toBe(1);
    expect(entryIndexFor([10, 20, 30], 99)).toBe(2);
  });

  it("prefers the later-written entry on equal times", () => {
    expect(entryIndexFor([10, 10], 10)).toBe(1);
  });

  it("handles a backwards time jump by timestamp, not position", () => {
    // [15:30], then a typo [14:00]: media at 16:00 belongs to 15:30.
    expect(entryIndexFor([1530, 1400], 1600)).toBe(0);
    expect(entryIndexFor([1530, 1400], 1500)).toBe(1);
  });
});
