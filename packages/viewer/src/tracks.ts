import type { LatLngTuple } from "leaflet";
import type { Media, Track, TrackPoint } from "@retrace/shared";
import type { MapPin } from "./components/RouteMap.tsx";
import { tripUrl } from "./data.ts";
import { mediaAlt, thumbPath } from "./media.ts";
import { strings } from "./strings.ts";

export function sportLabel(sport: string | undefined): string {
  return (sport && strings.sports[sport]) || strings.track;
}

export function routeOf(track: Track): LatLngTuple[] {
  return track.points.map((p) => [p[0], p[1]]);
}

/** Map pins showing the thumbnails of the positioned media among `ids`. */
export function pinsFor(
  slug: string,
  ids: readonly string[],
  media: Record<string, Media>,
): MapPin[] {
  return ids.flatMap((id) => {
    const m = media[id];
    if (!m?.gps) return [];
    return [
      {
        id,
        lat: m.gps.lat,
        lon: m.gps.lon,
        label: mediaAlt(m),
        thumb: tripUrl(slug, thumbPath(m)),
        isVideo: m.type === "video",
        ...(m.color && { color: m.color }),
      },
    ];
  });
}

/**
 * Position at `fraction` (0–1) of a route's length, for showing the elevation profile's hover
 * point on the map. The profile's distances come from the full-resolution track; the simplified
 * points are slightly shorter, so positions are matched by fraction rather than meters.
 */
export function positionAtFraction(
  points: readonly TrackPoint[],
  fraction: number,
): LatLngTuple | undefined {
  if (points.length === 0) return undefined;
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1]! + distance(points[i - 1]!, points[i]!));
  const target = Math.min(1, Math.max(0, fraction)) * lengths.at(-1)!;
  for (let i = 1; i < points.length; i++) {
    if (lengths[i]! >= target) {
      const segment = lengths[i]! - lengths[i - 1]!;
      const f = segment === 0 ? 0 : (target - lengths[i - 1]!) / segment;
      const a = points[i - 1]!;
      const b = points[i]!;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
  }
  return [points.at(-1)![0], points.at(-1)![1]];
}

/** Equirectangular approximation; plenty for relative positions along a track. */
function distance(a: TrackPoint, b: TrackPoint): number {
  const rad = Math.PI / 180;
  const x = (b[1] - a[1]) * Math.cos(((a[0] + b[0]) / 2) * rad);
  const y = b[0] - a[0];
  return Math.hypot(x, y);
}
