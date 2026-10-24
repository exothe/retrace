// Date and number formatting (SPEC section 10.1). Day dates like "2026-10-24" are calendar
// dates that the generator already computed in the trip timezone, so they are formatted as
// such (in UTC, where a calendar date can't shift); instants use the trip timezone.

const LOCALE = "de-DE";

function calendarDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12));
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function format(date: Date, options: Intl.DateTimeFormatOptions): string {
  const key = JSON.stringify(options);
  let formatter = formatters.get(key);
  if (!formatter) formatters.set(key, (formatter = new Intl.DateTimeFormat(LOCALE, options)));
  return formatter.format(date);
}

/** "Samstag, 24. Oktober 2026" */
export function formatLongDate(isoDate: string): string {
  return format(calendarDate(isoDate), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Samstag" */
export function formatWeekday(isoDate: string): string {
  return format(calendarDate(isoDate), { weekday: "long", timeZone: "UTC" });
}

/** "24. Oktober" */
export function formatDayMonth(isoDate: string): string {
  return format(calendarDate(isoDate), { day: "numeric", month: "long", timeZone: "UTC" });
}

/**
 * "23.–30. Oktober 2026", "30. September – 2. Oktober 2026",
 * "30. Dezember 2025 – 2. Januar 2026", or "24. Oktober 2026" for a single day.
 */
export function formatDateRange(start: string, end: string): string {
  const [sy, sm] = start.split("-");
  const [ey, em] = end.split("-");
  const day = (iso: string) => format(calendarDate(iso), { day: "numeric", timeZone: "UTC" });
  const monthYear = (iso: string) =>
    format(calendarDate(iso), { month: "long", year: "numeric", timeZone: "UTC" });
  const full = (iso: string) =>
    format(calendarDate(iso), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  if (start === end) return full(start);
  if (sy === ey && sm === em) return `${day(start)}.–${day(end)}. ${monthYear(end)}`;
  if (sy === ey) return `${formatDayMonth(start)} – ${full(end)}`;
  return `${full(start)} – ${full(end)}`;
}

/** 3.4 -> "0:03", 75 -> "1:15", 3725 -> "1:02:05" */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const numberFormats = new Map<number, Intl.NumberFormat>();
function formatNumber(value: number, fractionDigits: number): string {
  let format = numberFormats.get(fractionDigits);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    numberFormats.set(fractionDigits, format);
  }
  return format.format(value);
}

/** 3039 -> "3,0 km", 12345 -> "12,3 km", 640 -> "0,6 km", 123456 -> "123 km" */
export function formatKilometers(meters: number): string {
  const km = meters / 1000;
  return `${formatNumber(km, km >= 100 ? 0 : 1)} km`;
}

/** 178 -> "178 m", 1234 -> "1.234 m" */
export function formatMeters(meters: number): string {
  return `${formatNumber(Math.round(meters), 0)} m`;
}

/** 12600 -> "3:30 h", 2700 -> "45 min" */
export function formatHours(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h`;
}
