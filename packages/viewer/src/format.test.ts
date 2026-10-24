import { describe, expect, it } from "vitest";
import {
  formatDateRange,
  formatDayMonth,
  formatDuration,
  formatLongDate,
  formatWeekday,
} from "./format.ts";

describe("dates", () => {
  it("formats long German dates", () => {
    expect(formatLongDate("2026-10-24")).toBe("Samstag, 24. Oktober 2026");
    expect(formatWeekday("2026-10-23")).toBe("Freitag");
    expect(formatDayMonth("2026-03-01")).toBe("1. März");
  });

  it("formats ranges within a month, across months and across years", () => {
    expect(formatDateRange("2026-10-23", "2026-10-30")).toBe("23.–30. Oktober 2026");
    expect(formatDateRange("2026-09-30", "2026-10-02")).toBe("30. September – 2. Oktober 2026");
    expect(formatDateRange("2025-12-30", "2026-01-02")).toBe("30. Dezember 2025 – 2. Januar 2026");
    expect(formatDateRange("2026-10-24", "2026-10-24")).toBe("24. Oktober 2026");
  });

  it("doesn't shift calendar dates, whatever the viewer's timezone", () => {
    // Day dates are calendar dates; formatting must not move them to a neighbouring day.
    expect(formatLongDate("2026-01-01")).toBe("Donnerstag, 1. Januar 2026");
    expect(formatLongDate("2026-12-31")).toBe("Donnerstag, 31. Dezember 2026");
  });
});

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(3.4)).toBe("0:03");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});
