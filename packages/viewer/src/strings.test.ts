import { describe, expect, it } from "vitest";
import { strings } from "./strings.ts";

describe("strings", () => {
  it("has no empty UI strings", () => {
    for (const value of Object.values(strings)) {
      const text = typeof value === "function" ? value(1 as never, "x" as never) : value;
      expect(text.trim()).not.toBe("");
    }
  });

  it("pluralizes counts", () => {
    expect(strings.days(1)).toBe("1 Tag");
    expect(strings.days(4)).toBe("4 Tage");
    expect(strings.photos(1)).toBe("1 Foto");
    expect(strings.videos(2)).toBe("2 Videos");
  });
});
