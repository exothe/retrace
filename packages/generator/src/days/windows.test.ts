import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { parseNotes } from "../notes/parse.ts";
import { assignDay, buildDayWindows, entryInstant } from "./windows.ts";

const ZONE = "Europe/Lisbon";
const days = (...lines: string[]) => parseNotes(["# Verlauf", ...lines].join("\n")).days;
const at = (local: string) => DateTime.fromISO(local, { zone: ZONE });
const assign = (notes: ReturnType<typeof days>, local: string) =>
  assignDay(at(local), buildDayWindows(notes, ZONE), ZONE);

describe("entryInstant", () => {
  it("combines the entry's date and time in the trip timezone", () => {
    const [day] = days("## 24.10.2026", "* [23:40] A", "* [00:30] B");
    expect(entryInstant(day!.entries[0]!, ZONE).toISO()).toBe("2026-10-24T22:40:00.000Z");
    expect(entryInstant(day!.entries[1]!, ZONE).toISO()).toBe("2026-10-24T23:30:00.000Z");
  });
});

describe("buildDayWindows", () => {
  it("covers local midnight to midnight, respecting DST", () => {
    const windows = buildDayWindows(
      days("## 24.10.2026", "* [10:00] A", "## 25.10.2026", "* [10:00] B"),
      ZONE,
    );
    expect(windows.map((w) => [w.date, w.start.toISO(), w.end.toISO()])).toEqual([
      ["2026-10-24", "2026-10-23T23:00:00.000Z", "2026-10-24T23:00:00.000Z"],
      // 25.10. has 25 hours in Lisbon.
      ["2026-10-25", "2026-10-24T23:00:00.000Z", "2026-10-26T00:00:00.000Z"],
    ]);
  });

  it("extends a rolled-over day to just after its last entry and starts the next day there", () => {
    const windows = buildDayWindows(
      days("## 24.10.2026", "* [23:40] A", "* [00:30] B", "## 25.10.2026", "* [10:00] C"),
      ZONE,
    );
    expect(windows[0]!.end.toISO()).toBe("2026-10-24T23:31:00.000Z");
    expect(windows[1]!.start.toISO()).toBe("2026-10-24T23:31:00.000Z");
  });

  it("sorts days by date", () => {
    const windows = buildDayWindows(
      days("## 25.10.2026", "* [10:00] A", "## 24.10.2026", "* [10:00] B"),
      ZONE,
    );
    expect(windows.map((w) => w.date)).toEqual(["2026-10-24", "2026-10-25"]);
  });
});

describe("assignDay", () => {
  const notes = days("## 24.10.2026", "* [23:40] A", "* [00:30] B", "## 26.10.2026", "* [10:00] C");

  it("assigns to the note day whose window contains the instant", () => {
    expect(assign(notes, "2026-10-24T00:00:00")).toEqual({ date: "2026-10-24", hasNotes: true });
    expect(assign(notes, "2026-10-24T23:59:59")).toEqual({ date: "2026-10-24", hasNotes: true });
  });

  it("assigns early-morning media of a rolled-over night to the previous day", () => {
    expect(assign(notes, "2026-10-25T00:20:00")).toEqual({ date: "2026-10-24", hasNotes: true });
    expect(assign(notes, "2026-10-25T00:30:59")).toEqual({ date: "2026-10-24", hasNotes: true });
  });

  it("gives media after the rolled-over window its own media-only day", () => {
    expect(assign(notes, "2026-10-25T00:31:00")).toEqual({ date: "2026-10-25", hasNotes: false });
    expect(assign(notes, "2026-10-25T12:00:00")).toEqual({ date: "2026-10-25", hasNotes: false });
  });

  it("gives media before and after the trip media-only days", () => {
    expect(assign(notes, "2026-10-23T23:59:59")).toEqual({ date: "2026-10-23", hasNotes: false });
    expect(assign(notes, "2026-10-27T00:00:00")).toEqual({ date: "2026-10-27", hasNotes: false });
  });

  it("uses the trip timezone for media-only dates", () => {
    // 23:30 UTC on 25.10. is still 25.10. in Lisbon (UTC+0 after the DST switch).
    const instant = DateTime.fromISO("2026-10-25T23:30:00Z");
    expect(assignDay(instant, buildDayWindows(notes, ZONE), ZONE).date).toBe("2026-10-25");
    // 23:30 UTC on 23.10. is already 24.10. in Lisbon (UTC+1).
    const before = DateTime.fromISO("2026-10-23T23:30:00Z");
    expect(assignDay(before, [], ZONE).date).toBe("2026-10-24");
  });
});
