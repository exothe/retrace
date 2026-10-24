import { DateTime } from "luxon";
import type { NoteDay, NoteEntry } from "../notes/parse.ts";

/** The absolute instant of an entry: its local date and time in the trip timezone. */
export function entryInstant(entry: NoteEntry, zone: string): DateTime {
  const [year, month, day] = entry.date.split("-").map(Number);
  return DateTime.fromObject(
    { year, month, day, hour: entry.hour, minute: entry.minute },
    { zone },
  ).toUTC();
}

export interface DayWindow {
  /** The note day's date, "YYYY-MM-DD" */
  date: string;
  /** Inclusive */
  start: DateTime;
  /** Exclusive */
  end: DateTime;
}

/**
 * Time windows of the note days (SPEC section 8.8): local midnight to midnight, except that a
 * day with rolled-over entries extends to just after its last entry (the end of that entry's
 * minute), and the following day starts there. Sorted by date.
 */
export function buildDayWindows(days: readonly NoteDay[], zone: string): DayWindow[] {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const windows: DayWindow[] = [];
  for (const day of sorted) {
    const midnight = DateTime.fromISO(day.date, { zone }).startOf("day");
    let start: DateTime = midnight.toUTC();
    let end: DateTime = midnight.plus({ days: 1 }).startOf("day").toUTC();
    const last = day.entries.at(-1);
    if (last?.rolledOver) {
      const afterLast = entryInstant(last, zone).plus({ minutes: 1 });
      if (afterLast > end) end = afterLast;
    }
    const previous = windows.at(-1);
    if (previous && previous.end > start) start = previous.end;
    if (start < end) windows.push({ date: day.date, start, end });
  }
  return windows;
}

export interface DayAssignment {
  date: string;
  /** False for media-only dates */
  hasNotes: boolean;
}

/** The day an instant belongs to: the note day whose window contains it, else its local date. */
export function assignDay(
  instant: DateTime,
  windows: readonly DayWindow[],
  zone: string,
): DayAssignment {
  for (const window of windows) {
    if (instant >= window.start && instant < window.end)
      return { date: window.date, hasNotes: true };
  }
  return { date: instant.setZone(zone).toISODate()!, hasNotes: false };
}
