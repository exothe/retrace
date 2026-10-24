import { describe, expect, it } from "vitest";
import { createProgram } from "./program.ts";

describe("createProgram", () => {
  it("is named retrace and reports the package version", () => {
    const program = createProgram();
    expect(program.name()).toBe("retrace");
    expect(program.version()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
