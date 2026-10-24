import type { DateTime } from "luxon";
import type { Day, Entry, Media, TimelineItem, Trip } from "@retrace/shared";
import { assignDay, buildDayWindows, entryInstant } from "../days/windows.ts";
import type { NoteDay } from "../notes/parse.ts";
import type { ProcessedMedia } from "../process/process-media.ts";

export interface AssembleInput {
  slug: string;
  title: string;
  timezone: string;
  days: readonly NoteDay[];
  media: readonly ProcessedMedia[];
  /** Media id of the cover */
  cover?: string;
  generatedAt: string;
}

/** Folder of the media files inside the trip folder. */
export const MEDIA_DIR = "media";

/** File names of a media item's outputs inside `media/` (SPEC section 8.5). */
export function mediaFileNames(p: ProcessedMedia): Record<string, string> {
  const id = p.item.id;
  return p.type === "photo"
    ? { thumb: `${id}-thumb.webp`, display: `${id}-display.webp` }
    : { video: `${id}.mp4`, poster: `${id}-poster.webp`, posterThumb: `${id}-poster-thumb.webp` };
}

/**
 * Builds trip.json (SPEC sections 8.8 and 9.2): note days plus media-only days, each media item
 * under the latest entry at or before its time (or in `before`), sorted by time.
 */
export function assembleTrip(input: AssembleInput): Trip {
  const zone = input.timezone;
  const windows = buildDayWindows(input.days, zone);

  const media: Record<string, Media> = {};
  const mediaByDate = new Map<string, ProcessedMedia[]>();
  for (const p of input.media) {
    media[p.item.id] = toMedia(p, zone);
    const { date } = assignDay(p.item.takenAt, windows, zone);
    const list = mediaByDate.get(date);
    if (list) list.push(p);
    else mediaByDate.set(date, [p]);
  }

  const noteDays = new Map(input.days.map((day) => [day.date, day]));
  const dates = [...new Set([...noteDays.keys(), ...mediaByDate.keys()])].sort();
  const days = dates.map((date) =>
    buildDay(date, noteDays.get(date), sortByTime(mediaByDate.get(date) ?? []), zone),
  );

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    slug: input.slug,
    title: input.title,
    timezone: zone,
    startDate: dates[0] ?? "",
    endDate: dates.at(-1) ?? "",
    ...(input.cover !== undefined && { cover: input.cover }),
    days,
    media,
    tracks: {},
  };
}

function buildDay(
  date: string,
  noteDay: NoteDay | undefined,
  media: ProcessedMedia[],
  zone: string,
): Day {
  const entries: Entry[] = (noteDay?.entries ?? []).map((entry, index) => ({
    id: `${date}-${index + 1}`,
    time: entry.time,
    timestamp: iso(entryInstant(entry, zone)),
    text: entry.text,
    items: [],
  }));
  const instants = (noteDay?.entries ?? []).map((entry) => entryInstant(entry, zone).toMillis());
  const before: TimelineItem[] = [];
  for (const p of media) {
    const index = entryIndexFor(instants, p.item.takenAt.toMillis());
    (index === undefined ? before : entries[index]!.items).push({ kind: "media", id: p.item.id });
  }
  return {
    date,
    hasNotes: noteDay !== undefined,
    before,
    entries,
    mapMediaIds: media.filter((p) => p.item.gps).map((p) => p.item.id),
  };
}

/**
 * The entry a media item belongs under: the one with the latest timestamp at or before the
 * item, preferring the later-written entry on ties. Entries are usually in time order, but a
 * backwards time jump (a warning) must not swallow later media.
 */
export function entryIndexFor(
  entryInstants: readonly number[],
  instant: number,
): number | undefined {
  let best: number | undefined;
  for (const [index, t] of entryInstants.entries()) {
    if (t <= instant && (best === undefined || t >= entryInstants[best]!)) best = index;
  }
  return best;
}

function sortByTime(media: ProcessedMedia[]): ProcessedMedia[] {
  return [...media].sort(
    (a, b) =>
      a.item.takenAt.toMillis() - b.item.takenAt.toMillis() || (a.item.id < b.item.id ? -1 : 1),
  );
}

function toMedia(p: ProcessedMedia, zone: string): Media {
  const names = mediaFileNames(p);
  const at = (name: string) => `${MEDIA_DIR}/${names[name]}`;
  const base = {
    id: p.item.id,
    takenAt: iso(p.item.takenAt),
    localTime: p.item.takenAt.setZone(zone).toFormat("HH:mm"),
    width: p.info.width,
    height: p.info.height,
    color: p.info.color,
    ...(p.item.gps && {
      gps: {
        lat: round(p.item.gps.lat, 6),
        lon: round(p.item.gps.lon, 6),
        source: "exif" as const,
      },
    }),
  };
  return p.type === "photo"
    ? { ...base, type: "photo", thumb: at("thumb"), display: at("display") }
    : {
        ...base,
        type: "video",
        src: at("video"),
        poster: at("poster"),
        posterThumb: at("posterThumb"),
        durationSeconds: p.info.durationSeconds,
      };
}

function iso(instant: DateTime): string {
  return instant.toUTC().toISO({ suppressMilliseconds: true })!;
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
