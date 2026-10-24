import { describe, expect, it } from "vitest";
import { encodeFit } from "../test/fit-files.ts";
import type { TestRecord } from "../test/fit-files.ts";
import { parseFit } from "./fit.ts";
import { MAX_PROFILE_POINTS, elevationChange, processTrack } from "./track.ts";

const minute = (m: number) =>
  new Date(Date.parse("2026-10-24T08:00:00Z") + m * 60_000).toISOString();
const straight = (n: number, extra: (i: number) => Partial<TestRecord> = () => ({})) =>
  Array.from({ length: n }, (_, i): TestRecord => ({
    t: minute(i),
    lat: 38.7,
    lon: -9.1 + i * 0.001,
    ...extra(i),
  }));

describe("parseFit", () => {
  it("reads positioned records in degrees, with enhanced altitude and distance", () => {
    const parsed = parseFit(
      encodeFit([
        { t: minute(0), lat: 38.7979, lon: -9.3881, ele: 210.5, distance: 0 },
        { t: minute(1) }, // no position: skipped
        { t: minute(2), lat: 38.7944, lon: -9.3897, altitude: 330, distance: 400 },
      ]),
    );
    expect(parsed.problems).toEqual([]);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0]).toMatchObject({ t: Date.parse(minute(0)), distance: 0 });
    expect(parsed.records[0]!.ele).toBeCloseTo(210.5, 0); // FIT stores altitude in 0.2 m steps
    expect(parsed.records[0]!.lat).toBeCloseTo(38.7979, 6);
    expect(parsed.records[0]!.lon).toBeCloseTo(-9.3881, 6);
    expect(parsed.records[1]!.ele).toBeCloseTo(330, 0);
  });

  it("reads session totals and the sport", () => {
    const { session } = parseFit(
      encodeFit(straight(2), {
        sport: "hiking",
        totalDistance: 3039,
        totalTimerTime: 11400,
        totalAscent: 178,
        totalDescent: 177,
      }),
    );
    expect(session).toEqual({
      sport: "hiking",
      totalDistance: 3039,
      totalTimerTime: 11400,
      totalAscent: 178,
      totalDescent: 177,
    });
  });

  it("leaves out a generic sport", () => {
    expect(parseFit(encodeFit(straight(2), { sport: "generic" })).session.sport).toBeUndefined();
  });

  it("rejects files that aren't FIT", () => {
    expect(() => parseFit(new TextEncoder().encode("not a fit file at all"))).toThrow(
      "not a FIT file",
    );
  });

  it("reports a damaged file but keeps what it could read", () => {
    const data = encodeFit(straight(20));
    data[data.length - 1]! ^= 0xff; // break the CRC
    const parsed = parseFit(data);
    expect(parsed.problems[0]).toMatch(/integrity/);
  });
});

describe("processTrack", () => {
  it("prefers session values for the stats", () => {
    const parsed = parseFit(
      encodeFit(
        straight(11, (i) => ({ ele: 100 + i * 10, distance: i * 100 })),
        {
          totalDistance: 999,
          totalTimerTime: 500,
          totalAscent: 42,
          totalDescent: 7,
        },
      ),
    );
    expect(processTrack(parsed, 5).stats).toEqual({
      distanceMeters: 999,
      durationSeconds: 600,
      movingSeconds: 500,
      ascentMeters: 42,
      descentMeters: 7,
      minElevation: 100,
      maxElevation: 200,
    });
  });

  it("falls back to haversine distance and computed ascent, without moving time", () => {
    // Up 200 m, then down 200 m.
    const parsed = parseFit(
      encodeFit(straight(21, (i) => ({ ele: i <= 10 ? 100 + i * 20 : 300 - (i - 10) * 20 }))),
    );
    const { stats } = processTrack(parsed, 5);
    expect(stats.distanceMeters).toBeCloseTo(20 * 86.8, -1); // 0.001° of longitude at 38.7°N
    expect(stats.movingSeconds).toBeUndefined();
    expect(stats.ascentMeters).toBeGreaterThan(150);
    expect(stats.ascentMeters).toBeLessThanOrEqual(200);
    expect(stats.descentMeters).toBeGreaterThan(150);
    expect(stats.descentMeters).toBeLessThanOrEqual(200);
  });

  it("omits elevation stats without altitude data", () => {
    const { stats, elevationProfile, points } = processTrack(parseFit(encodeFit(straight(3))), 5);
    expect(stats).toEqual({ distanceMeters: expect.any(Number) as number, durationSeconds: 120 });
    expect(elevationProfile).toEqual([]);
    expect(points.every((p) => p[2] === null)).toBe(true);
  });

  it("simplifies points, keeping elevation and time offsets", () => {
    const { points } = processTrack(
      parseFit(encodeFit(straight(50, (i) => ({ ele: 100 + i })))),
      5,
    );
    expect(points).toEqual([
      [38.7, -9.1, 100, 0],
      [38.7, -9.051, 149, 2940],
    ]);
  });

  it("downsamples the elevation profile to at most 300 points, keeping both ends", () => {
    const parsed = parseFit(encodeFit(straight(1000, (i) => ({ ele: i, distance: i * 10 }))));
    const profile = processTrack(parsed, 5).elevationProfile;
    expect(profile).toHaveLength(MAX_PROFILE_POINTS);
    expect(profile[0]).toEqual([0, 0]);
    expect(profile.at(-1)).toEqual([9990, 999]);
  });
});

describe("elevationChange", () => {
  it("ignores noise below the hysteresis", () => {
    const noisy = Array.from({ length: 100 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    expect(elevationChange(noisy)).toEqual({ ascent: 0, descent: 0 });
  });

  it("sums real climbs and descents", () => {
    const hill = [
      ...Array.from({ length: 50 }, (_, i) => 100 + i * 2),
      ...Array.from({ length: 50 }, (_, i) => 198 - i * 2),
    ];
    const { ascent, descent } = elevationChange(hill);
    expect(ascent).toBeGreaterThan(90);
    expect(descent).toBeGreaterThan(90);
  });
});
