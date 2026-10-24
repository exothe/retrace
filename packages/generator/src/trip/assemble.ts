import type { DateTime } from "luxon";
import type { Day, Entry, Media, TimelineItem, Track, Trip } from "@retrace/shared";
import { assignDay, buildDayWindows, entryInstant } from "../days/windows.ts";
import type { NoteDay } from "../notes/parse.ts";
import type { ProcessedMedia } from "../process/process-media.ts";
import type { Position } from "../tracks/geotag.ts";
import type { LoadedTrack } from "../tracks/load.ts";

export interface AssembleInput {
  slug: string;
  title: string;
  timezone: string;
  days: readonly NoteDay[];
  media: readonly ProcessedMedia[];
  tracks: readonly LoadedTrack[];
  /** Media positions from EXIF or geotagging, by media id */
  positions: ReadonlyMap<string, Position>;
  /** Ids of the positioned media taken during each track, by track id */
  trackMedia: ReadonlyMap<string, readonly string[]>;
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
    ? { thumb: `${id}-thumb.avif`, display: `${id}-display.avif` }
    : { video: `${id}.mp4`, poster: `${id}-poster.avif`, posterThumb: `${id}-poster-thumb.avif` };
}

/**
 * Builds trip.json (SPEC sections 8.8 and 9.2): note days plus days with only media or tracks.
 * Each media item and track goes under the latest entry at or before its time (or in `before`),
 * sorted by time; a track counts by its start time.
 */
export function assembleTrip(input: AssembleInput): Trip {
  const zone = input.timezone;
  const windows = buildDayWindows(input.days, zone);

  const media: Record<string, Media> = {};
  const tracks: Record<string, Track> = {};
  const itemsByDate = new Map<string, DayItem[]>();
  const add = (instant: DateTime, item: DayItem) => {
    const { date } = assignDay(instant, windows, zone);
    const list = itemsByDate.get(date);
    if (list) list.push(item);
    else itemsByDate.set(date, [item]);
  };
  for (const p of input.media) {
    media[p.item.id] = toMedia(p, zone, input.positions.get(p.item.id));
    add(p.item.takenAt, { kind: "media", id: p.item.id, at: p.item.takenAt.toMillis() });
  }
  const mediaIds = new Set(Object.keys(media));
  for (const t of input.tracks) {
    tracks[t.id] = toTrack(
      t,
      zone,
      (input.trackMedia.get(t.id) ?? []).filter((id) => mediaIds.has(id)),
    );
    add(t.start, { kind: "track", id: t.id, at: t.start.toMillis() });
  }

  const noteDays = new Map(input.days.map((day) => [day.date, day]));
  const dates = [...new Set([...noteDays.keys(), ...itemsByDate.keys()])].sort();
  const days = dates.map((date) =>
    buildDay(date, noteDays.get(date), sortByTime(itemsByDate.get(date) ?? []), media, zone),
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
    tracks,
  };
}

/** A media item or track with its time, for sorting into a day. */
type DayItem = TimelineItem & { at: number };

function buildDay(
  date: string,
  noteDay: NoteDay | undefined,
  items: DayItem[],
  media: Record<string, Media>,
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
  for (const { kind, id, at } of items) {
    const index = entryIndexFor(instants, at);
    (index === undefined ? before : entries[index]!.items).push({ kind, id });
  }
  return {
    date,
    hasNotes: noteDay !== undefined,
    before,
    entries,
    mapMediaIds: items.filter((i) => i.kind === "media" && media[i.id]!.gps).map((i) => i.id),
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

function sortByTime(items: DayItem[]): DayItem[] {
  return [...items].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
}

function toTrack(t: LoadedTrack, zone: string, mediaIds: string[]): Track {
  return {
    id: t.id,
    start: iso(t.start),
    end: iso(t.end),
    localStart: t.start.setZone(zone).toFormat("HH:mm"),
    localEnd: t.end.setZone(zone).toFormat("HH:mm"),
    ...(t.processed.sport !== undefined && { sport: t.processed.sport }),
    stats: t.processed.stats,
    points: t.processed.points,
    elevationProfile: t.processed.elevationProfile,
    mediaIds,
  };
}

function toMedia(p: ProcessedMedia, zone: string, position: Position | undefined): Media {
  const names = mediaFileNames(p);
  const at = (name: string) => `${MEDIA_DIR}/${names[name]}`;
  const base = {
    id: p.item.id,
    takenAt: iso(p.item.takenAt),
    localTime: p.item.takenAt.setZone(zone).toFormat("HH:mm"),
    width: p.info.width,
    height: p.info.height,
    color: p.info.color,
    ...(position && {
      gps: { lat: round(position.lat, 6), lon: round(position.lon, 6), source: position.source },
    }),
    ...(p.item.title !== undefined && { title: p.item.title }),
    ...(p.item.caption !== undefined && { caption: p.item.caption }),
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
