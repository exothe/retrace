import { describe, expect, it } from "vitest";
import { haversine, interpolatePosition, semicirclesToDegrees, simplify } from "./geo.ts";

describe("semicirclesToDegrees", () => {
  it("converts FIT semicircles", () => {
    expect(semicirclesToDegrees(0)).toBe(0);
    expect(semicirclesToDegrees(2 ** 31)).toBe(180);
    expect(semicirclesToDegrees(-(2 ** 30))).toBe(-90);
    expect(semicirclesToDegrees(462876977)).toBeCloseTo(38.7979, 4);
  });
});

describe("haversine", () => {
  it("measures distances on the Earth", () => {
    expect(haversine(0, 0, 0, 1)).toBeCloseTo(111195, -1);
    // Lisbon Rossio to Belém, about 6.3 km
    expect(haversine(38.7139, -9.1394, 38.6916, -9.2157) / 1000).toBeCloseTo(7.06, 1);
    expect(haversine(38.7, -9.1, 38.7, -9.1)).toBe(0);
  });
});

describe("simplify", () => {
  // ~1.1 m per 0.00001°
  const line = (offsets: number[]) =>
    offsets.map((d, i) => ({ lat: 38.7 + d, lon: -9.1 + i * 0.001 }));

  it("drops points closer to the line than the tolerance and keeps the ends", () => {
    const points = line([0, 0.00002, -0.00002, 0.00001, 0]);
    expect(simplify(points, 5)).toEqual([0, 4]);
  });

  it("keeps points farther away than the tolerance", () => {
    // A peak: points 1 and 3 lie on the slopes, only the summit is far off the 0–4 line.
    const points = line([0, 0.0005, 0.001, 0.0005, 0]);
    expect(simplify(points, 5)).toEqual([0, 2, 4]);
    expect(simplify(points, 500)).toEqual([0, 4]);
  });

  it("handles tiny and degenerate inputs", () => {
    expect(simplify([], 5)).toEqual([]);
    expect(simplify(line([0]), 5)).toEqual([0]);
    expect(
      simplify(
        [
          { lat: 1, lon: 1 },
          { lat: 1, lon: 1 },
          { lat: 1, lon: 1 },
        ],
        5,
      ),
    ).toEqual([0, 2]);
  });

  it("copes with long tracks without recursion limits", () => {
    const points = Array.from({ length: 100_000 }, (_, i) => ({
      lat: 38.7 + Math.sin(i / 50) * 0.01,
      lon: -9.1 + i * 0.00001,
    }));
    const kept = simplify(points, 5);
    expect(kept[0]).toBe(0);
    expect(kept.at(-1)).toBe(points.length - 1);
    expect(kept.length).toBeLessThan(points.length / 10);
  });
});

describe("interpolatePosition", () => {
  const records = [
    { t: 1000, lat: 10, lon: 20 },
    { t: 2000, lat: 12, lon: 22 },
    { t: 4000, lat: 12, lon: 26 },
  ];

  it("interpolates linearly between the two nearest records", () => {
    expect(interpolatePosition(records, 1500)).toEqual({ lat: 11, lon: 21 });
    expect(interpolatePosition(records, 3000)).toEqual({ lat: 12, lon: 24 });
    expect(interpolatePosition(records, 2000)).toEqual({ lat: 12, lon: 22 });
  });

  it("clamps outside the track", () => {
    expect(interpolatePosition(records, 0)).toEqual({ lat: 10, lon: 20 });
    expect(interpolatePosition(records, 9000)).toEqual({ lat: 12, lon: 26 });
  });
});
