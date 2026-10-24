import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { parseNotes } from "../notes/parse.ts";
import { mediaDiagnostics } from "./check-media.ts";
import type { LoadedTrack } from "../tracks/load.ts";
import type { MediaItem } from "./scan.ts";

const ZONE = "Europe/Lisbon";
const media = (...locals: string[]) =>
  locals.map(
    (local) => ({ takenAt: DateTime.fromISO(local, { zone: ZONE }).toUTC() }) as MediaItem,
  );
const check = (notes: string, items: MediaItem[], tracks: LoadedTrack[] = []) =>
  mediaDiagnostics(parseNotes(notes).days, items, tracks, ZONE, "/trip/notes.md").map(
    (d) => `${d.line ?? "-"}: ${d.message}`,
  );

const NOTES = "# Verlauf\n## 23.10.2026\n* [09:00] A\n## 24.10.2026\n* [23:00] B\n* [00:30] C\n";

describe("mediaDiagnostics", () => {
  it("is quiet when all media is on note days, including a rolled-over night", () => {
    expect(check(NOTES, media("2026-10-23T10:00", "2026-10-24T08:00", "2026-10-25T00:20"))).toEqual(
      [],
    );
  });

  it("names dates with media but no day heading, with the number of files", () => {
    expect(
      check(
        NOTES,
        media("2026-10-22T18:00", "2026-10-22T19:00", "2026-10-25T09:00", "2026-10-23T10:00"),
      ),
    ).toEqual([
      "-: 2 photos and videos on 22.10.2026, but no day heading for that date (forgotten heading?)",
      "-: 1 photo or video on 25.10.2026, but no day heading for that date (forgotten heading?)",
    ]);
  });

  it("warns once per day whose entries are more than 2 days outside the media range", () => {
    const notes =
      "# Verlauf\n## 23.10.2025\n* [09:00] A\n* [10:00] B\n## 24.10.2026\n* [09:00] C\n## 25.10.2026\n* [12:00] D\n";
    expect(check(notes, media("2026-10-24T10:00", "2026-10-25T10:00"))).toEqual([
      "2: day 23.10.2025 is more than 2 days outside the time range of the photos and videos (24.10.2026 – 25.10.2026); wrong year or month?",
    ]);
  });

  it("allows entries up to exactly 2 days from the media range", () => {
    const items = media("2026-10-25T10:00");
    const day = (time: string) => check(`# Verlauf\n## 27.10.2026\n* [${time}] A\n`, items);
    expect(day("10:00").filter((line) => line.startsWith("2:"))).toEqual([]);
    expect(day("10:01").filter((line) => line.startsWith("2:"))).toHaveLength(1);
  });

  it("reports the media-only date before day-range warnings in emission order", () => {
    const notes = "# Verlauf\n## 23.10.2025\n* [09:00] A\n";
    expect(check(notes, media("2026-10-24T10:00"))).toEqual([
      "-: 1 photo or video on 24.10.2026, but no day heading for that date (forgotten heading?)",
      "2: day 23.10.2025 is more than 2 days outside the time range of the photos and videos (24.10.2026 – 24.10.2026); wrong year or month?",
    ]);
  });

  it("counts tracks on dates without a day heading", () => {
    const track = {
      start: DateTime.fromISO("2026-10-22T09:00", { zone: ZONE }).toUTC(),
    } as LoadedTrack;
    expect(check(NOTES, media("2026-10-22T18:00", "2026-10-24T10:00"), [track])).toEqual([
      "-: 1 photo or video and 1 track on 22.10.2026, but no day heading for that date (forgotten heading?)",
    ]);
    expect(check(NOTES, [], [track])).toEqual([
      "-: 1 track on 22.10.2026, but no day heading for that date (forgotten heading?)",
    ]);
  });

  it("skips the range check without media", () => {
    expect(check(NOTES, [])).toEqual([]);
  });
});
