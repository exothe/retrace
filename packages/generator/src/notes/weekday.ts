/** German weekday names, indexed by ISO weekday (1 = Monday). */
export const WEEKDAYS = [
  "",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

const ABBREVIATIONS = ["", "mo", "di", "mi", "do", "fr", "sa", "so"] as const;

/**
 * Parses a German weekday (`Freitag`, `fr`, `Fr.`), case-insensitive.
 * Returns the ISO weekday (1 = Monday … 7 = Sunday), or undefined if it isn't one.
 */
export function parseWeekday(text: string): number | undefined {
  const normalized = text.trim().toLowerCase().replace(/\.$/, "");
  for (let i = 1; i <= 7; i++) {
    if (normalized === WEEKDAYS[i]!.toLowerCase() || normalized === ABBREVIATIONS[i]) return i;
  }
  return undefined;
}
