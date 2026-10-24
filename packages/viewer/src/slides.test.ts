import type { Entry, Photo } from "@retrace/shared";
import { describe, expect, it } from "vitest";
import { toSlide } from "./slides.ts";

const photo: Photo = {
  id: "p1",
  type: "photo",
  takenAt: "2026-10-23T08:15:12Z",
  localTime: "09:15",
  width: 1600,
  height: 1200,
  thumb: "media/p1-thumb.avif",
  display: "media/p1-display.avif",
};
const entry: Entry = {
  id: "2026-10-23-1",
  time: "09:10",
  timestamp: "2026-10-23T08:10:00Z",
  text: "Raus in die Stadt",
  items: [{ kind: "media", id: "p1" }],
};

describe("toSlide", () => {
  it("shows the entry text when the item has no title or caption", () => {
    expect(toSlide("t", photo, entry)).toMatchObject({
      title: "09:15 Uhr",
      description: "Raus in die Stadt",
    });
    expect(toSlide("t", photo, undefined)).not.toHaveProperty("description");
  });

  it("shows the item's own title and caption instead of the entry text", () => {
    expect(toSlide("t", { ...photo, title: "Alfama" }, entry).description).toBe("Alfama");
    expect(toSlide("t", { ...photo, caption: "Blick vom Miradouro" }, entry).description).toBe(
      "Blick vom Miradouro",
    );
    expect(
      toSlide("t", { ...photo, title: "Alfama", caption: "Blick vom Miradouro" }, undefined)
        .description,
    ).toBe("Alfama\nBlick vom Miradouro");
  });
});
