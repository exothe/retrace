/** Mean Earth radius in meters. */
const EARTH_RADIUS = 6371008.8;
const RAD = Math.PI / 180;

/** FIT positions are semicircles: degrees = semicircles × (180 / 2³¹) (SPEC section 8.7). */
export function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / 2 ** 31);
}

/** Great-circle distance in meters. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Douglas–Peucker simplification with a tolerance in meters. Points are projected onto a local
 * plane around their mean position, which is accurate enough for a track's extent. Returns the
 * indices of the points to keep (always the first and last), in order.
 */
export function simplify(
  points: readonly { lat: number; lon: number }[],
  toleranceMeters: number,
): number[] {
  if (points.length <= 2) return points.map((_, i) => i);
  const lat0 = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const kx = Math.cos(lat0 * RAD) * EARTH_RADIUS * RAD;
  const ky = EARTH_RADIUS * RAD;
  const xs = points.map((p) => p.lon * kx);
  const ys = points.map((p) => p.lat * ky);

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  // Iterative, so long tracks can't overflow the call stack.
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDistance = -1;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(xs[i]!, ys[i]!, xs[first]!, ys[first]!, xs[last]!, ys[last]!);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (index >= 0 && maxDistance > toleranceMeters) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const result: number[] = [];
  keep.forEach((k, i) => k && result.push(i));
  return result;
}

function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Position at time `t` (ms), interpolated linearly between the two nearest records (sorted by
 * time); clamped to the first or last record outside the track's time range.
 */
export function interpolatePosition(
  records: readonly { t: number; lat: number; lon: number }[],
  t: number,
): { lat: number; lon: number } {
  const first = records[0]!;
  const last = records.at(-1)!;
  if (t <= first.t) return { lat: first.lat, lon: first.lon };
  if (t >= last.t) return { lat: last.lat, lon: last.lon };
  let lo = 0;
  let hi = records.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (records[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = records[lo]!;
  const b = records[hi]!;
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
}
