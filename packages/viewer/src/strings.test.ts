import { describe, expect, it } from "vitest";
import { strings } from "./strings.ts";

describe("strings", () => {
  it("has no empty UI strings", () => {
    for (const value of Object.values(strings)) expect(value.trim()).not.toBe("");
  });
});
