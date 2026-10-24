import type { Day, Entry, Media, Trip } from "@retrace/shared";
import { formatDuration } from "./format.ts";
import { strings } from "./strings.ts";

/** Ids of all media of a day, in chronological order (the lightbox order, SPEC section 10.6). */
export function dayMediaIds(day: Day, trip: Trip): string[] {
  const ids = [...day.before, ...day.entries.flatMap((e) => e.items)]
    .filter((item) => item.kind === "media")
    .map((item) => item.id)
    .filter((id) => trip.media[id] !== undefined);
  return ids.sort((a, b) => {
    const x = trip.media[a]!.takenAt;
    const y = trip.media[b]!.takenAt;
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/** The entry each media item of a day is listed under. */
export function entryByMediaId(day: Day): Map<string, Entry> {
  const map = new Map<string, Entry>();
  for (const entry of day.entries) {
    for (const item of entry.items) if (item.kind === "media") map.set(item.id, entry);
  }
  return map;
}

export function dayStats(day: Day, trip: Trip) {
  const ids = dayMediaIds(day, trip);
  const media = ids.map((id) => trip.media[id]!);
  return {
    mediaIds: ids,
    photos: media.filter((m) => m.type === "photo").length,
    videos: media.filter((m) => m.type === "video").length,
    tracks: [...day.before, ...day.entries.flatMap((e) => e.items)].filter(
      (i) => i.kind === "track",
    ).length,
  };
}

/** Thumbnail path (relative to the trip folder) of a photo, or a video's poster. */
export function thumbPath(media: Media): string {
  return media.type === "photo" ? media.thumb : media.posterThumb;
}

/** Alt text for a thumbnail or lightbox image. */
export function mediaAlt(media: Media): string {
  return media.type === "photo"
    ? strings.photoAlt(media.localTime)
    : strings.videoAlt(media.localTime, formatDuration(media.durationSeconds));
}
