import { describe, expect, it } from "vitest";
import { formatBytes, plural } from "./report.ts";

describe("formatBytes", () => {
  it("uses binary units with one decimal", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(270_532_608)).toBe("258.0 MB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
  });
});

describe("plural", () => {
  it("picks the singular for 1", () => {
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(2, "entry", "entries")).toBe("2 entries");
  });
});
