import { describe, expectTypeOf, it } from "vitest";
import type { Media, TimelineItem, Trip } from "./index.ts";

describe("shared schema types", () => {
  it("discriminates media by type", () => {
    const narrow = (m: Media) => (m.type === "video" ? m.durationSeconds : m.thumb);
    expectTypeOf(narrow).returns.toEqualTypeOf<number | string>();
  });

  it("discriminates timeline items by kind", () => {
    expectTypeOf<TimelineItem["kind"]>().toEqualTypeOf<"media" | "track">();
  });

  it("pins the schema version", () => {
    expectTypeOf<Trip["schemaVersion"]>().toEqualTypeOf<1>();
  });
});
