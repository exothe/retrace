import type { GpsSource } from "@retrace/shared";
import type { MediaItem } from "../media/scan.ts";
import type { TrackRecord } from "./fit.ts";
import { interpolatePosition } from "./geo.ts";

export interface TrackTimes {
  id: string;
  /** Full-resolution records, sorted by time */
  records: readonly TrackRecord[];
}

export interface Position {
  lat: number;
  lon: number;
  source: GpsSource;
}

/**
 * Positions of all media (SPEC section 8.7): media with its own GPS keeps it (`exif`); media
 * without GPS taken during a track (± tolerance) gets a position interpolated from the track's
 * records (`track`). Also returns, per track, the ids of the positioned media taken during it.
 */
export function geotag(
  media: readonly MediaItem[],
  tracks: readonly TrackTimes[],
  toleranceMinutes: number,
): { positions: Map<string, Position>; trackMedia: Map<string, string[]> } {
  const tolerance = toleranceMinutes * 60_000;
  const positions = new Map<string, Position>();
  const trackMedia = new Map<string, string[]>(tracks.map((t) => [t.id, []]));
  const during = (track: TrackTimes, t: number) =>
    t >= track.records[0]!.t - tolerance && t <= track.records.at(-1)!.t + tolerance;

  for (const item of media) {
    const t = item.takenAt.toMillis();
    if (item.gps) {
      positions.set(item.id, { ...item.gps, source: "exif" });
    } else {
      const track = tracks.find((tr) => during(tr, t));
      if (track)
        positions.set(item.id, { ...interpolatePosition(track.records, t), source: "track" });
    }
    if (positions.has(item.id)) {
      for (const track of tracks) if (during(track, t)) trackMedia.get(track.id)!.push(item.id);
    }
  }
  return { positions, trackMedia };
}
