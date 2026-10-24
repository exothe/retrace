import { describe, expect, it } from "vitest";
import { dayMediaIds, dayStats, entryByMediaId } from "./media.ts";
import { TRIP } from "./test/fixtures.ts";

describe("media helpers", () => {
  const day = TRIP.days[1]!;

  it("lists a day's media chronologically", () => {
    expect(dayMediaIds(day, TRIP)).toEqual(["p2", "v1", "p3"]);
    expect(dayMediaIds(TRIP.days[0]!, TRIP)).toEqual(["p1"]);
  });

  it("maps media to their entries", () => {
    const map = entryByMediaId(day);
    expect(map.get("v1")?.text).toBe("Raus in die <b>Stadt</b>");
    expect(map.get("p3")?.time).toBe("13:30");
  });

  it("counts photos, videos and tracks", () => {
    expect(dayStats(day, TRIP)).toEqual({
      mediaIds: ["p2", "v1", "p3"],
      photos: 2,
      videos: 1,
      tracks: 0,
    });
  });
});
