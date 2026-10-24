import path from "node:path";
import { describe, expect, it } from "vitest";
import { displayPath, formatReport, isFailure } from "./diagnostics.ts";
import type { Diagnostic } from "./diagnostics.ts";

const cwd = path.resolve("/trips");
const notes = path.join(cwd, "Lissabon 2026.md");
const config = path.join(cwd, "trip.config.json");

describe("formatReport", () => {
  it("formats lines as <file>:<line>: <severity>: <message>, grouped by file and sorted by line", () => {
    const diagnostics: Diagnostic[] = [
      { severity: "warning", file: notes, line: 12, message: "b" },
      { severity: "error", file: config, line: 3, message: "c" },
      { severity: "error", file: notes, line: 4, message: "a" },
      { severity: "error", file: notes, message: "no line" },
      { severity: "warning", file: notes, line: 12, message: "b2" },
      { severity: "error", message: "global" },
    ];
    expect(formatReport(diagnostics, cwd)).toEqual([
      "Lissabon 2026.md: error: no line",
      "Lissabon 2026.md:4: error: a",
      "Lissabon 2026.md:12: warning: b",
      "Lissabon 2026.md:12: warning: b2",
      "trip.config.json:3: error: c",
      "error: global",
    ]);
  });
});

describe("displayPath", () => {
  it("shows paths below cwd relative and others absolute", () => {
    expect(displayPath(path.join(cwd, "a", "b.md"), cwd)).toBe(path.join("a", "b.md"));
    const outside = path.resolve("/elsewhere/b.md");
    expect(displayPath(outside, cwd)).toBe(outside);
  });
});

describe("isFailure", () => {
  const warning: Diagnostic = { severity: "warning", message: "w" };
  const error: Diagnostic = { severity: "error", message: "e" };

  it("fails on errors, and on warnings only in strict mode", () => {
    expect(isFailure([], false)).toBe(false);
    expect(isFailure([warning], false)).toBe(false);
    expect(isFailure([warning], true)).toBe(true);
    expect(isFailure([error], false)).toBe(true);
  });
});
