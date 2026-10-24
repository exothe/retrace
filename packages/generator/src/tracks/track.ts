import type { ElevationPoint, TrackPoint, TrackStats } from "@retrace/shared";
import type { ParsedFit, TrackRecord } from "./fit.ts";
import { haversine, simplify } from "./geo.ts";

export const MAX_PROFILE_POINTS = 300;
/** Ascent/descent fallback: ignore altitude changes smaller than this (GPS/barometer noise). */
const ELEVATION_HYSTERESIS = 3;
const SMOOTHING_WINDOW = 5;

/** A track ready for trip.json, minus the media ids (which need the trip's media). */
export interface ProcessedTrack {
  stats: TrackStats;
  sport?: string;
  points: TrackPoint[];
  elevationProfile: ElevationPoint[];
}

/** Stats, simplified points and elevation profile of a parsed FIT file (SPEC section 8.7). */
export function processTrack(parsed: ParsedFit, simplifyToleranceMeters: number): ProcessedTrack {
  const { records, session } = parsed;
  const distances = cumulativeDistances(records);
  const elevations = records.map((r) => r.ele).filter((e): e is number => e !== null);
  const computed = elevationChange(elevations);

  const stats: TrackStats = {
    distanceMeters: Math.round(session.totalDistance ?? distances.at(-1) ?? 0),
    durationSeconds: Math.round((records.at(-1)!.t - records[0]!.t) / 1000),
  };
  if (session.totalTimerTime !== undefined)
    stats.movingSeconds = Math.round(session.totalTimerTime);
  const ascent = session.totalAscent ?? (elevations.length > 1 ? computed.ascent : undefined);
  const descent = session.totalDescent ?? (elevations.length > 1 ? computed.descent : undefined);
  if (ascent !== undefined) stats.ascentMeters = Math.round(ascent);
  if (descent !== undefined) stats.descentMeters = Math.round(descent);
  if (elevations.length > 0) {
    stats.minElevation = Math.round(Math.min(...elevations));
    stats.maxElevation = Math.round(Math.max(...elevations));
  }

  const start = records[0]!.t;
  const points = simplify(records, simplifyToleranceMeters).map((i): TrackPoint => {
    const r = records[i]!;
    return [
      round(r.lat, 6),
      round(r.lon, 6),
      r.ele === null ? null : round(r.ele, 1),
      Math.round((r.t - start) / 1000),
    ];
  });

  return {
    stats,
    ...(session.sport !== undefined && { sport: session.sport }),
    points,
    elevationProfile: elevationProfile(records, distances),
  };
}

/** Cumulative distance per record: the device's if every record has one, else haversine. */
export function cumulativeDistances(records: readonly TrackRecord[]): number[] {
  if (records.length > 0 && records.every((r) => r.distance !== null)) {
    const offset = records[0]!.distance!;
    return records.map((r) => r.distance! - offset);
  }
  let total = 0;
  return records.map((r, i) => {
    const previous = records[i - 1];
    if (previous) total += haversine(previous.lat, previous.lon, r.lat, r.lon);
    return total;
  });
}

/** Ascent and descent from smoothed altitude, with hysteresis against noise. */
export function elevationChange(elevations: readonly number[]): {
  ascent: number;
  descent: number;
} {
  const half = Math.floor(SMOOTHING_WINDOW / 2);
  const smoothed = elevations.map((_, i) => {
    const window = elevations.slice(Math.max(0, i - half), i + half + 1);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });
  let ascent = 0;
  let descent = 0;
  let reference = smoothed[0];
  for (const e of smoothed) {
    if (reference === undefined) break;
    if (e - reference >= ELEVATION_HYSTERESIS) {
      ascent += e - reference;
      reference = e;
    } else if (reference - e >= ELEVATION_HYSTERESIS) {
      descent += reference - e;
      reference = e;
    }
  }
  return { ascent, descent };
}

/** `[distance, elevation]` pairs, evenly downsampled to at most MAX_PROFILE_POINTS. */
export function elevationProfile(
  records: readonly TrackRecord[],
  distances: readonly number[],
): ElevationPoint[] {
  const all: ElevationPoint[] = [];
  records.forEach((r, i) => {
    if (r.ele !== null) all.push([Math.round(distances[i]!), round(r.ele, 1)]);
  });
  if (all.length <= MAX_PROFILE_POINTS) return all;
  const step = (all.length - 1) / (MAX_PROFILE_POINTS - 1);
  return Array.from({ length: MAX_PROFILE_POINTS }, (_, i) => all[Math.round(i * step)]!);
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
