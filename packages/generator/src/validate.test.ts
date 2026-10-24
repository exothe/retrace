import { describe, expect, it } from "vitest";
import type { MediaItem } from "./media/scan.ts";
import { resolveCover } from "./validate.ts";

const item = (id: string, kind: "photo" | "video", file: string, duplicates: string[] = []) =>
  ({
    id,
    kind,
    path: `/trip/Fotos/${file}`,
    duplicates: duplicates.map((d) => `/trip/Fotos/${d}`),
  }) as MediaItem;
const MEDIA = [
  item("v1", "video", "VID_1.mp4"),
  item("p1", "photo", "IMG_1.jpg"),
  item("p2", "photo", "Café.jpg", ["Kopie.jpg"]),
];
const config = (cover?: string) => ({
  configFile: "/trip/trip.config.json",
  ...(cover !== undefined && { cover }),
});

describe("resolveCover", () => {
  it("defaults to the first photo, else the first item", () => {
    expect(resolveCover(config(), MEDIA)).toEqual({ id: "p1" });
    expect(resolveCover(config(), [MEDIA[0]!])).toEqual({ id: "v1" });
    expect(resolveCover(config(), [])).toEqual({});
  });

  it("matches the configured file name, including NFD names and duplicates", () => {
    expect(resolveCover(config("VID_1.mp4"), MEDIA)).toEqual({ id: "v1" });
    expect(resolveCover(config("Café.jpg"), MEDIA)).toEqual({ id: "p2" });
    expect(resolveCover(config("Kopie.jpg"), MEDIA)).toEqual({ id: "p2" });
  });

  it("warns about an unknown cover and falls back", () => {
    expect(resolveCover(config("nope.jpg"), MEDIA)).toEqual({
      id: "p1",
      diagnostic: {
        severity: "warning",
        file: "/trip/trip.config.json",
        message: 'cover: "nope.jpg" is not among the photos and videos, using the first photo',
      },
    });
  });
});
