import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../diagnostics.ts";
import { parseNotes } from "./parse.ts";

const notes = (...lines: string[]) => lines.join("\n");

/** Compact form for assertions: "<line>: <severity>: <message>" */
const report = (diagnostics: Diagnostic[]) =>
  diagnostics.map((d) => `${d.line ?? "-"}: ${d.severity}: ${d.message}`);

const entries = (text: string) =>
  parseNotes(text).days.map((day) => ({
    date: day.date,
    entries: day.entries.map((e) => `${e.date} ${e.time} ${e.text}`),
  }));

describe("parseNotes", () => {
  describe("structure", () => {
    it("parses the example from the spec", () => {
      const result = parseNotes(
        notes(
          "# Verlauf",
          "",
          "## 23.10.2026 (Freitag)",
          "",
          "* [08:00] Aufgewacht",
          "* [09:10] Raus in die Stadt",
          "* [13:30] Super Mittagessen",
          "",
          "## 24.10.2026",
          "",
          "- [07:45] Früh los zur Wanderung",
          "* [23:40] Noch eine Bar gefunden",
          "* [00:30] Zurück im Hotel",
        ),
      );
      expect(result.diagnostics).toEqual([]);
      expect(result.days).toEqual([
        {
          date: "2026-10-23",
          line: 3,
          entries: [
            {
              line: 5,
              hour: 8,
              minute: 0,
              time: "08:00",
              text: "Aufgewacht",
              date: "2026-10-23",
              rolledOver: false,
            },
            expect.objectContaining({ line: 6, time: "09:10", text: "Raus in die Stadt" }),
            expect.objectContaining({ line: 7, time: "13:30", text: "Super Mittagessen" }),
          ],
        },
        {
          date: "2026-10-24",
          line: 9,
          entries: [
            expect.objectContaining({ time: "07:45", date: "2026-10-24", rolledOver: false }),
            expect.objectContaining({ time: "23:40", date: "2026-10-24", rolledOver: false }),
            expect.objectContaining({ time: "00:30", date: "2026-10-25", rolledOver: true }),
          ],
        },
      ]);
    });

    it("handles a BOM and CRLF line endings", () => {
      const result = parseNotes("\uFEFF# Verlauf\r\n## 23.10.2026\r\n* [08:00] Aufgewacht\r\n");
      expect(result.diagnostics).toEqual([]);
      expect(result.days[0]?.entries[0]?.text).toBe("Aufgewacht");
      expect(result.days[0]?.entries[0]?.line).toBe(3);
    });

    it("handles old Mac CR line endings", () => {
      expect(entries("# Verlauf\r## 23.10.2026\r* [08:00] A")).toEqual([
        { date: "2026-10-23", entries: ["2026-10-23 08:00 A"] },
      ]);
    });

    it("finds the section case-insensitively with surrounding whitespace", () => {
      expect(parseNotes("#   VERLAUF  \n## 1.2.2026\n* [8:00] A").diagnostics).toEqual([]);
    });

    it("ignores everything outside the section", () => {
      const result = parseNotes(
        notes(
          "# Packliste",
          "Random text",
          "## Not a day",
          "* [99:99] not an entry either",
          "# Verlauf",
          "## 23.10.2026",
          "* [08:00] A",
          "# Danach",
          "## 24.10.2026",
          "* [08:00] ignored",
          "garbage",
        ),
      );
      expect(result.diagnostics).toEqual([]);
      expect(result.days.map((d) => d.date)).toEqual(["2026-10-23"]);
    });

    it("skips Obsidian frontmatter", () => {
      const result = parseNotes(
        notes(
          "---",
          "# a YAML comment, not a heading",
          "tags: [urlaub]",
          "---",
          "# Verlauf",
          "## 23.10.2026",
          "* [08:00] A",
        ),
      );
      expect(result.diagnostics).toEqual([]);
      expect(result.days).toHaveLength(1);
    });

    it("does not treat headings inside code fences outside the section as headings", () => {
      const result = parseNotes(
        notes("```", "# Verlauf", "```", "# Verlauf", "## 23.10.2026", "* [08:00] A"),
      );
      expect(result.diagnostics).toEqual([]);
      expect(result.days[0]?.line).toBe(5);
    });

    it("accepts headings of any level 2 or deeper as day headings", () => {
      expect(
        entries(
          notes("# Verlauf", "### 23.10.2026", "* [08:00] A", "###### 24.10.2026", "* [09:00] B"),
        ),
      ).toEqual([
        { date: "2026-10-23", entries: ["2026-10-23 08:00 A"] },
        { date: "2026-10-24", entries: ["2026-10-24 09:00 B"] },
      ]);
    });

    it("accepts closing hashes on headings", () => {
      expect(parseNotes("# Verlauf #\n## 23.10.2026 ##\n* [08:00] A").diagnostics).toEqual([]);
    });

    it("ignores blank and whitespace-only lines", () => {
      expect(
        parseNotes("# Verlauf\n\n   \n## 23.10.2026\n\t\n* [08:00] A\n\n").diagnostics,
      ).toEqual([]);
    });

    it("accepts single-digit hours, indentation and trims entry text", () => {
      expect(entries("# Verlauf\n## 23.10.2026\n   *   [8:05]   Kaffee  \n-\t[9:00] Tee")).toEqual([
        { date: "2026-10-23", entries: ["2026-10-23 08:05 Kaffee", "2026-10-23 09:00 Tee"] },
      ]);
    });

    it("keeps entry text as plain text", () => {
      const text = "<b>Fett</b> & **nicht** [[Link]] #tag";
      expect(
        parseNotes(`# Verlauf\n## 23.10.2026\n* [08:00] ${text}`).days[0]?.entries[0]?.text,
      ).toBe(text);
    });

    it("normalizes text to NFC", () => {
      const nfd = "Fru\u0308h";
      const entry = parseNotes(`# Verlauf\n## 23.10.2026\n* [08:00] ${nfd}`).days[0]?.entries[0];
      expect(entry?.text).toBe("Früh");
    });

    it("accepts one-digit day and month", () => {
      expect(parseNotes("# Verlauf\n## 3.1.2026\n* [08:00] A").days[0]?.date).toBe("2026-01-03");
    });
  });

  describe("errors", () => {
    it("reports a missing Verlauf heading without a line", () => {
      expect(report(parseNotes("# Notizen\n## 23.10.2026\n* [08:00] A").diagnostics)).toEqual([
        '-: error: no "# Verlauf" heading found',
      ]);
    });

    it("does not accept Verlauf as a level-2 heading", () => {
      expect(report(parseNotes("## Verlauf\n").diagnostics)).toEqual([
        '-: error: no "# Verlauf" heading found',
      ]);
    });

    it("reports entries and text before the first day heading", () => {
      expect(
        report(
          parseNotes(notes("# Verlauf", "* [08:00] A", "Some text", "## 23.10.2026", "* [09:00] B"))
            .diagnostics,
        ),
      ).toEqual([
        "2: error: entry before the first day heading (missing day heading?)",
        "3: error: text before the first day heading (missing day heading?)",
      ]);
    });

    it("reports lines that are neither entries nor headings", () => {
      expect(
        report(
          parseNotes(
            notes(
              "# Verlauf",
              "## 23.10.2026",
              "* [08:00] A",
              "Just text",
              "* [8:5] bad",
              "* no time",
              "[09:00] no bullet",
              "* [09:00]",
            ),
          ).diagnostics,
        ),
      ).toEqual([
        '4: error: unexpected line, expected an entry ("* [HH:MM] text") or a heading',
        '5: error: invalid entry, expected "* [HH:MM] text"',
        '6: error: invalid entry, expected "* [HH:MM] text"',
        '7: error: unexpected line, expected an entry ("* [HH:MM] text") or a heading',
        '8: error: invalid entry, expected "* [HH:MM] text"',
      ]);
    });

    it("reports headings that aren't day headings", () => {
      expect(
        report(
          parseNotes(
            notes(
              "# Verlauf",
              "## 23.10.2026",
              "* [08:00] A",
              "## Ausflug",
              "* [09:00] B",
              "## 2026-10-24",
              "##",
            ),
          ).diagnostics,
        ),
      ).toEqual([
        '4: error: heading "Ausflug" is not a valid day heading (expected "DD.MM.YYYY" or "DD.MM.YYYY (Wochentag)")',
        '6: error: heading "2026-10-24" is not a valid day heading (expected "DD.MM.YYYY" or "DD.MM.YYYY (Wochentag)")',
        '7: error: heading "" is not a valid day heading (expected "DD.MM.YYYY" or "DD.MM.YYYY (Wochentag)")',
      ]);
    });

    it("doesn't attach entries below an invalid heading to the previous day", () => {
      const result = parseNotes(
        notes("# Verlauf", "## 23.10.2026", "* [08:00] A", "## Ausflug", "* [09:00] B"),
      );
      expect(result.days[0]?.entries).toHaveLength(1);
    });

    it("reports invalid dates", () => {
      expect(
        report(
          parseNotes(
            notes(
              "# Verlauf",
              "## 31.02.2026",
              "* [08:00] A",
              "## 29.02.2025",
              "## 1.13.2026",
              "## 29.02.2028",
              "* [08:00] B",
            ),
          ).diagnostics,
        ),
      ).toEqual([
        '2: error: invalid date "31.02.2026"',
        '4: error: invalid date "29.02.2025"',
        '5: error: invalid date "1.13.2026"',
      ]);
    });

    it("reports invalid times", () => {
      expect(
        report(
          parseNotes(
            notes(
              "# Verlauf",
              "## 23.10.2026",
              "* [25:10] A",
              "* [12:60] B",
              "* [24:00] C",
              "* [23:59] D",
            ),
          ).diagnostics,
        ),
      ).toEqual([
        "3: error: invalid time [25:10]",
        "4: error: invalid time [12:60]",
        "5: error: invalid time [24:00]",
      ]);
    });

    it("reports invalid times even below an invalid heading", () => {
      expect(
        report(parseNotes(notes("# Verlauf", "## 31.02.2026", "* [25:00] A")).diagnostics),
      ).toEqual(['2: error: invalid date "31.02.2026"', "3: error: invalid time [25:00]"]);
    });

    it("reports duplicate day headings and ignores their entries", () => {
      const result = parseNotes(
        notes("# Verlauf", "## 23.10.2026", "* [08:00] A", "## 23.10.2026 (Fr)", "* [09:00] B"),
      );
      expect(report(result.diagnostics)).toEqual([
        "4: error: duplicate day heading 23.10.2026 (first at line 2)",
      ]);
      expect(result.days).toHaveLength(1);
      expect(result.days[0]?.entries).toHaveLength(1);
    });

    it("treats differently padded dates as duplicates", () => {
      expect(
        report(
          parseNotes(
            notes("# Verlauf", "## 03.01.2026", "* [08:00] A", "## 3.1.2026", "* [08:00] A"),
          ).diagnostics,
        ),
      ).toEqual(["4: error: duplicate day heading 03.01.2026 (first at line 2)"]);
    });

    it("reports unknown weekday text", () => {
      expect(
        report(parseNotes(notes("# Verlauf", "## 23.10.2026 (Freitg)", "* [08:00] A")).diagnostics),
      ).toEqual(['2: error: unknown weekday "Freitg"']);
    });
  });

  describe("weekdays", () => {
    const check = (heading: string) =>
      report(parseNotes(notes("# Verlauf", `## ${heading}`, "* [08:00] A")).diagnostics);

    it.each([
      "23.10.2026 (Freitag)",
      "23.10.2026 (freitag)",
      "23.10.2026 (FREITAG)",
      "23.10.2026 (Fr)",
      "23.10.2026 (fr.)",
      "23.10.2026 (Fr.)",
      "23.10.2026(Fr)",
      "23.10.2026 ( Freitag )",
      "23.10.2026 (Freitag.)",
      "19.10.2026 (Montag)",
      "20.10.2026 (Di)",
      "21.10.2026 (Mittwoch)",
      "22.10.2026 (Do)",
      "24.10.2026 (Samstag)",
      "25.10.2026 (So.)",
    ])("accepts %s", (heading) => {
      expect(check(heading)).toEqual([]);
    });

    it("warns when the weekday doesn't match the date", () => {
      expect(check("24.10.2026 (Freitag)")).toEqual([
        '2: warning: weekday "Freitag" doesn\'t match 24.10.2026, which is a Samstag',
      ]);
      expect(check("24.10.2026 (fr.)")).toEqual([
        '2: warning: weekday "fr." doesn\'t match 24.10.2026, which is a Samstag',
      ]);
    });

    it.each(["23.10.2026 (Frei)", "23.10.2026 (Friday)", "23.10.2026 (F)", "23.10.2026 (Fr..)"])(
      "rejects %s",
      (heading) => {
        expect(check(heading)[0]).toMatch(/error: unknown weekday/);
      },
    );
  });

  describe("warnings", () => {
    it("warns about day headings out of order", () => {
      expect(
        report(
          parseNotes(
            notes(
              "# Verlauf",
              "## 24.10.2026",
              "* [08:00] A",
              "## 23.10.2026",
              "* [08:00] B",
              "## 25.10.2026",
              "* [08:00] C",
            ),
          ).diagnostics,
        ),
      ).toEqual(["4: warning: day 23.10.2026 is not in ascending order (follows 24.10.2026)"]);
    });

    it("warns about days without entries", () => {
      expect(
        report(
          parseNotes(
            notes(
              "# Verlauf",
              "## 23.10.2026",
              "",
              "## 24.10.2026",
              "* [08:00] A",
              "## 25.10.2026",
            ),
          ).diagnostics,
        ),
      ).toEqual([
        "2: warning: day 23.10.2026 has no entries",
        "6: warning: day 25.10.2026 has no entries",
      ]);
    });
  });

  describe("midnight rollover", () => {
    const day = (...times: string[]) =>
      parseNotes(notes("# Verlauf", "## 24.10.2026", ...times.map((t) => `* [${t}] x`)));
    const dates = (...times: string[]) =>
      day(...times).days[0]!.entries.map((e) => `${e.date} ${e.time}`);

    it("rolls over from evening to early morning, and stays rolled over", () => {
      const result = day("07:45", "23:40", "00:30", "02:15");
      expect(result.diagnostics).toEqual([]);
      expect(result.days[0]!.entries.map((e) => `${e.date} ${e.time}`)).toEqual([
        "2026-10-24 07:45",
        "2026-10-24 23:40",
        "2026-10-25 00:30",
        "2026-10-25 02:15",
      ]);
      expect(result.days[0]!.entries.map((e) => e.rolledOver)).toEqual([false, false, true, true]);
    });

    it("rolls over at the boundaries 18:00 and 06:00", () => {
      expect(dates("18:00", "06:00")).toEqual(["2026-10-24 18:00", "2026-10-25 06:00"]);
    });

    it("rolls over across month and year ends", () => {
      const result = parseNotes(notes("# Verlauf", "## 31.12.2026", "* [22:00] A", "* [01:00] B"));
      expect(result.days[0]!.entries[1]!.date).toBe("2027-01-01");
    });

    it("keeps equal times without a warning", () => {
      const result = day("09:00", "09:00");
      expect(result.diagnostics).toEqual([]);
      expect(result.days[0]!.entries.every((e) => e.date === "2026-10-24")).toBe(true);
    });

    it("doesn't treat the first entry of a day as a rollover", () => {
      expect(dates("01:00", "02:00")).toEqual(["2026-10-24 01:00", "2026-10-24 02:00"]);
    });

    it.each([
      ["17:59", "01:00"],
      ["23:00", "06:01"],
      ["15:30", "14:00"],
    ])("warns about a backwards jump from %s to %s and stays on the date", (from, to) => {
      const result = day(from, to);
      expect(report(result.diagnostics)).toEqual([
        `4: warning: time goes backwards: [${to}] after [${from}] (typo?)`,
      ]);
      expect(result.days[0]!.entries[1]!.date).toBe("2026-10-24");
    });

    it("compares against the previous entry as written, even after a backwards jump", () => {
      const result = day("20:00", "19:00", "01:00");
      expect(report(result.diagnostics)).toEqual([
        "4: warning: time goes backwards: [19:00] after [20:00] (typo?)",
      ]);
      expect(result.days[0]!.entries.map((e) => e.date)).toEqual([
        "2026-10-24",
        "2026-10-24",
        "2026-10-25",
      ]);
    });

    it("allows only one rollover per day", () => {
      const result = day("22:00", "01:00", "23:00", "02:00");
      expect(report(result.diagnostics)).toEqual([
        "6: warning: time goes backwards: [02:00] after [23:00] (typo?)",
      ]);
      expect(result.days[0]!.entries.map((e) => e.date)).toEqual([
        "2026-10-24",
        "2026-10-25",
        "2026-10-25",
        "2026-10-25",
      ]);
    });

    it("resets rollover state for each day", () => {
      const result = parseNotes(
        notes(
          "# Verlauf",
          "## 24.10.2026",
          "* [23:00] A",
          "* [01:00] B",
          "## 25.10.2026",
          "* [10:00] C",
        ),
      );
      expect(result.diagnostics).toEqual([]);
      expect(result.days[1]!.entries[0]).toMatchObject({ date: "2026-10-25", rolledOver: false });
    });

    it("ignores invalid times for rollover detection", () => {
      const result = day("23:00", "25:00", "01:00");
      expect(report(result.diagnostics)).toEqual(["4: error: invalid time [25:00]"]);
      expect(result.days[0]!.entries.map((e) => e.date)).toEqual(["2026-10-24", "2026-10-25"]);
    });
  });
});
