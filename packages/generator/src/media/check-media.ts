import { DateTime } from "luxon";
import type { Diagnostic } from "../diagnostics.ts";
import { assignDay, buildDayWindows, entryInstant } from "../days/windows.ts";
import { formatDate } from "../notes/parse.ts";
import type { NoteDay } from "../notes/parse.ts";
import type { MediaItem } from "./scan.ts";

const FAR_OUTSIDE_DAYS = 2;

/**
 * Media-related note warnings (SPEC section 5.4): media on dates without a day heading, and days
 * whose entries are far outside the time range of the media.
 */
export function mediaDiagnostics(
  days: readonly NoteDay[],
  media: readonly MediaItem[],
  zone: string,
  notesFile: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const windows = buildDayWindows(days, zone);

  const unheaded = new Map<string, number>();
  for (const item of media) {
    const { date, hasNotes } = assignDay(item.takenAt, windows, zone);
    if (!hasNotes) unheaded.set(date, (unheaded.get(date) ?? 0) + 1);
  }
  for (const [date, count] of [...unheaded].sort(([a], [b]) => (a < b ? -1 : 1))) {
    diagnostics.push({
      severity: "warning",
      file: notesFile,
      message:
        `${count} ${count === 1 ? "photo or video" : "photos and videos"} on ${formatDate(date)}, ` +
        "but no day heading for that date (forgotten heading?)",
    });
  }

  if (media.length > 0) {
    const times = media.map((item) => item.takenAt.toMillis());
    const first = Math.min(...times);
    const last = Math.max(...times);
    const margin = FAR_OUTSIDE_DAYS * 24 * 3600 * 1000;
    // Entries only carry a time, so an entry that far off always means its day heading has a
    // wrong date; report it once per day, at the heading.
    for (const day of days) {
      const outside = day.entries.filter((entry) => {
        const t = entryInstant(entry, zone).toMillis();
        return t < first - margin || t > last + margin;
      });
      if (outside.length > 0) {
        diagnostics.push({
          severity: "warning",
          file: notesFile,
          line: day.line,
          message:
            `day ${formatDate(day.date)} is more than ${FAR_OUTSIDE_DAYS} days outside the time ` +
            `range of the photos and videos (${formatLocal(first, zone)} – ${formatLocal(last, zone)}); ` +
            "wrong year or month?",
        });
      }
    }
  }
  return diagnostics;
}

function formatLocal(millis: number, zone: string): string {
  return formatDate(DateTime.fromMillis(millis, { zone }).toISODate()!);
}
