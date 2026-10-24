import path from "node:path";
import { describe, expect, it } from "vitest";
import { displayPath } from "../diagnostics.ts";
import { ExitCode } from "../exit-codes.ts";
import { useTempDir } from "../test/temp-dir.ts";
import { runCheck } from "./check.ts";

const tempDir = useTempDir();

const CONFIG = JSON.stringify(
  {
    title: "Lissabon 2026",
    slug: "lissabon-2026",
    timezone: "Europe/Lisbon",
    notes: "./Lissabon 2026.md",
    media: "./Fotos",
    output: "../site",
  },
  null,
  2,
);

async function run(notes: string, options: { strict?: boolean; config?: string } = {}) {
  const { dir, write, folder } = await tempDir();
  await folder("trip/Fotos");
  await write("trip/Lissabon 2026.md", notes);
  const configFile = await write("trip/trip.json", options.config ?? CONFIG);
  const lines: string[] = [];
  const code = await runCheck(configFile, options, { log: (line) => lines.push(line) });
  // Paths depend on the temp folder; keep only the file name for assertions.
  const prefix = displayPath(path.join(dir, "trip")) + path.sep;
  return { code, lines: lines.map((line) => line.replace(prefix, "")) };
}

describe("runCheck", () => {
  it("succeeds for valid notes and prints a summary", async () => {
    expect(await run("# Verlauf\n## 23.10.2026 (Fr)\n* [08:00] Aufgewacht\n")).toEqual({
      code: ExitCode.Success,
      lines: ["Notes: 1 day, 1 entry", "0 errors, 0 warnings"],
    });
  });

  it("reports note errors with file and line and fails", async () => {
    expect(await run("# Verlauf\n* [08:00] A\n## 23.10.2026\n* [25:00] B\n")).toEqual({
      code: ExitCode.ValidationError,
      lines: [
        "Notes: 1 day, 0 entries",
        "Lissabon 2026.md:2: error: entry before the first day heading (missing day heading?)",
        "Lissabon 2026.md:3: warning: day 23.10.2026 has no entries",
        "Lissabon 2026.md:4: error: invalid time [25:00]",
        "2 errors, 1 warning",
      ],
    });
  });

  it("passes with warnings, but fails with --strict", async () => {
    const notes = "# Verlauf\n## 24.10.2026 (Freitag)\n* [08:00] A\n";
    expect((await run(notes)).code).toBe(ExitCode.Success);
    const strict = await run(notes, { strict: true });
    expect(strict.code).toBe(ExitCode.ValidationError);
    expect(strict.lines.at(-1)).toBe("0 errors, 1 warning (warnings are errors with --strict)");
  });

  it("reports config errors without reading the notes", async () => {
    expect(await run("", { config: CONFIG.replace("Europe/Lisbon", "Mars/Olympus") })).toEqual({
      code: ExitCode.ValidationError,
      lines: [
        "trip.json:4: error: timezone: must be an IANA timezone like Europe/Lisbon",
        "1 error, 0 warnings",
      ],
    });
  });
});
