import { DateTime } from "luxon";
import type { Diagnostic } from "../diagnostics.ts";
import { WEEKDAYS, parseWeekday } from "./weekday.ts";

/** An entry line, `* [13:30] Super Mittagessen` (SPEC section 5.2). */
export interface NoteEntry {
  /** 1-based line number */
  line: number;
  hour: number;
  minute: number;
  /** Zero-padded clock time, e.g. "08:00" */
  time: string;
  text: string;
  /** Local calendar date of the entry, "YYYY-MM-DD"; the day after the heading if rolled over */
  date: string;
  /** Whether the entry is after a midnight rollover (SPEC section 5.3) */
  rolledOver: boolean;
}

export interface NoteDay {
  /** The heading's date, "YYYY-MM-DD" */
  date: string;
  /** 1-based line number of the heading */
  line: number;
  entries: NoteEntry[];
}

export interface ParseResult {
  days: NoteDay[];
  /** Diagnostics without `file`; the caller knows which file was parsed */
  diagnostics: Diagnostic[];
}

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const DAY_HEADING = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(\(\s*([^)]+?)\s*\))?\s*$/;
const ENTRY = /^\s*[*-]\s+\[(\d{1,2}):(\d{2})\]\s+(.+?)\s*$/;
const BULLET = /^\s*[*-](\s|$)/;
const SECTION_TITLE = "verlauf";
const ROLLOVER_FROM = 18 * 60;
const ROLLOVER_TO = 6 * 60;

interface Heading {
  level: number;
  text: string;
}

/**
 * Parses the `# Verlauf` section of a notes file into days and entries and validates it
 * (SPEC sections 5.2–5.4). Pure: media-related checks happen elsewhere.
 */
export function parseNotes(text: string): ParseResult {
  const lines = text
    .normalize("NFC")
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\r|\n/);
  const diagnostics: Diagnostic[] = [];
  const days: NoteDay[] = [];
  const dayLines = new Map<string, number>();
  const error = (line: number, message: string) =>
    diagnostics.push({ severity: "error", line, message });
  const warning = (line: number, message: string) =>
    diagnostics.push({ severity: "warning", line, message });

  let inSection = false;
  let foundSection = false;
  let beforeFirstDay = true;
  /** The day entries currently go to; null below an invalid or duplicate day heading */
  let day: NoteDay | null = null;
  let previousMinutes: number | undefined;
  let rolledOver = false;

  const finishDay = () => {
    if (day && day.entries.length === 0) {
      warning(day.line, `day ${formatDate(day.date)} has no entries`);
    }
    day = null;
    previousMinutes = undefined;
    rolledOver = false;
  };

  const startDay = (lineNo: number, headingText: string) => {
    beforeFirstDay = false;
    const match = DAY_HEADING.exec(headingText);
    if (!match) {
      error(
        lineNo,
        `heading "${headingText}" is not a valid day heading ` +
          `(expected "DD.MM.YYYY" or "DD.MM.YYYY (Wochentag)")`,
      );
      return;
    }
    const [, d, m, y, , weekdayText] = match;
    const date = DateTime.fromObject({ year: +y!, month: +m!, day: +d! }, { zone: "utc" });
    if (!date.isValid) {
      error(lineNo, `invalid date "${d}.${m}.${y}"`);
      return;
    }
    const iso = date.toISODate()!;
    const firstLine = dayLines.get(iso);
    if (firstLine !== undefined) {
      error(lineNo, `duplicate day heading ${formatDate(iso)} (first at line ${firstLine})`);
      return;
    }
    dayLines.set(iso, lineNo);

    if (weekdayText !== undefined) {
      const weekday = parseWeekday(weekdayText);
      if (weekday === undefined) {
        error(lineNo, `unknown weekday "${weekdayText}"`);
      } else if (weekday !== date.weekday) {
        warning(
          lineNo,
          `weekday "${weekdayText}" doesn't match ${formatDate(iso)}, ` +
            `which is a ${WEEKDAYS[date.weekday]}`,
        );
      }
    }

    const previous = days.at(-1);
    if (previous && previous.date > iso) {
      warning(
        lineNo,
        `day ${formatDate(iso)} is not in ascending order (follows ${formatDate(previous.date)})`,
      );
    }

    day = { date: iso, line: lineNo, entries: [] };
    days.push(day);
  };

  const addEntry = (lineNo: number, match: RegExpExecArray) => {
    const [, h, min, entryText] = match;
    const hour = +h!;
    const minute = +min!;
    if (beforeFirstDay) {
      error(lineNo, "entry before the first day heading (missing day heading?)");
      return;
    }
    if (hour > 23 || minute > 59) {
      error(lineNo, `invalid time [${h}:${min}]`);
      return;
    }
    // Below an invalid or duplicate heading: that heading already has an error.
    if (!day) return;

    const minutes = hour * 60 + minute;
    if (previousMinutes !== undefined && minutes < previousMinutes) {
      if (!rolledOver && previousMinutes >= ROLLOVER_FROM && minutes <= ROLLOVER_TO) {
        rolledOver = true;
      } else {
        warning(
          lineNo,
          `time goes backwards: [${formatTime(hour, minute)}] after ` +
            `[${formatTime(Math.floor(previousMinutes / 60), previousMinutes % 60)}] (typo?)`,
        );
      }
    }
    previousMinutes = minutes;

    const date = rolledOver
      ? DateTime.fromISO(day.date, { zone: "utc" }).plus({ days: 1 }).toISODate()!
      : day.date;
    day.entries.push({
      line: lineNo,
      hour,
      minute,
      time: formatTime(hour, minute),
      text: entryText!,
      date,
      rolledOver,
    });
  };

  let fence: string | undefined;
  const start = frontmatterEnd(lines);
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;

    const fenceMatch = FENCE.exec(line);
    if (fence === undefined && fenceMatch) {
      fence = fenceMatch[1]!;
    } else if (fence !== undefined && fenceMatch && isClosingFence(fenceMatch[1]!, fence)) {
      fence = undefined;
      if (!inSection) continue;
    }
    const heading = fence === undefined ? parseHeading(line) : undefined;

    if (!inSection) {
      if (!foundSection && heading?.level === 1 && heading.text.toLowerCase() === SECTION_TITLE) {
        inSection = foundSection = true;
      }
      continue;
    }

    if (line.trim() === "") continue;

    if (heading?.level === 1) {
      inSection = false;
      continue;
    }
    if (heading) {
      finishDay();
      startDay(lineNo, heading.text);
      continue;
    }

    const entry = ENTRY.exec(line);
    if (entry) {
      addEntry(lineNo, entry);
    } else if (beforeFirstDay) {
      error(lineNo, "text before the first day heading (missing day heading?)");
    } else if (BULLET.test(line)) {
      error(lineNo, 'invalid entry, expected "* [HH:MM] text"');
    } else {
      error(lineNo, 'unexpected line, expected an entry ("* [HH:MM] text") or a heading');
    }
  }
  finishDay();

  if (!foundSection) {
    diagnostics.push({ severity: "error", message: 'no "# Verlauf" heading found' });
  }

  return { days, diagnostics };
}

function parseHeading(line: string): Heading | undefined {
  const match = HEADING.exec(line);
  if (!match) return undefined;
  return { level: match[1]!.length, text: (match[2] ?? "").trim() };
}

function isClosingFence(candidate: string, opening: string): boolean {
  return candidate[0] === opening[0] && candidate.length >= opening.length;
}

/** Index of the first line after Obsidian YAML frontmatter (`---` … `---`), or 0 if there is none. */
function frontmatterEnd(lines: readonly string[]): number {
  if (lines[0]?.trimEnd() !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trimEnd();
    if (line === "---" || line === "...") return i + 1;
  }
  return 0;
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** "2026-10-24" -> "24.10.2026", matching how dates are written in the notes */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}
