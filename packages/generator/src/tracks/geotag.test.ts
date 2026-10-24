import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import type { MediaItem } from "../media/scan.ts";
import { geotag } from "./geotag.ts";

const at = (iso: string) => Date.parse(iso);
const item = (id: string, iso: string, gps?: { lat: number; lon: number }) =>
  ({ id, takenAt: DateTime.fromISO(iso, { zone: "utc" }), ...(gps && { gps }) }) as MediaItem;
const track = {
  id: "t1",
  records: [
    { t: at("2026-10-24T08:00:00Z"), lat: 38.0, lon: -9.0, ele: null, distance: null },
    { t: at("2026-10-24T09:00:00Z"), lat: 39.0, lon: -10.0, ele: null, distance: null },
  ],
};

describe("geotag", () => {
  it("interpolates positions for media without GPS taken during a track", () => {
    const { positions } = geotag([item("a", "2026-10-24T08:30:00Z")], [track], 2);
    expect(positions.get("a")).toEqual({ lat: 38.5, lon: -9.5, source: "track" });
  });

  it("keeps the media's own GPS", () => {
    const { positions } = geotag(
      [item("a", "2026-10-24T08:30:00Z", { lat: 1, lon: 2 })],
      [track],
      2,
    );
    expect(positions.get("a")).toEqual({ lat: 1, lon: 2, source: "exif" });
  });

  it("applies the tolerance before and after the track, clamping to its ends", () => {
    const { positions } = geotag(
      [
        item("before", "2026-10-24T07:58:00Z"),
        item("tooEarly", "2026-10-24T07:57:59Z"),
        item("after", "2026-10-24T09:02:00Z"),
        item("tooLate", "2026-10-24T09:02:01Z"),
      ],
      [track],
      2,
    );
    expect(positions.get("before")).toEqual({ lat: 38, lon: -9, source: "track" });
    expect(positions.get("after")).toEqual({ lat: 39, lon: -10, source: "track" });
    expect(positions.has("tooEarly")).toBe(false);
    expect(positions.has("tooLate")).toBe(false);
  });

  it("lists the positioned media taken during each track", () => {
    const { trackMedia } = geotag(
      [
        item("exif", "2026-10-24T08:10:00Z", { lat: 1, lon: 2 }),
        item("tagged", "2026-10-24T08:20:00Z"),
        item("outside", "2026-10-24T12:00:00Z", { lat: 1, lon: 2 }),
      ],
      [track],
      2,
    );
    expect(trackMedia.get("t1")).toEqual(["exif", "tagged"]);
  });
});
