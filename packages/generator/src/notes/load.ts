import { readFile } from "node:fs/promises";
import type { TripConfig } from "../config.ts";
import type { Diagnostic } from "../diagnostics.ts";
import { parseNotes } from "./parse.ts";
import type { NoteDay } from "./parse.ts";

/** Reads and parses the trip's notes file; diagnostics carry the notes file path. */
export async function loadNotes(
  config: TripConfig,
): Promise<{ days: NoteDay[]; diagnostics: Diagnostic[] }> {
  let text: string;
  try {
    text = await readFile(config.notes, "utf8");
  } catch (e) {
    return {
      days: [],
      diagnostics: [
        {
          severity: "error",
          file: config.notes,
          message: `cannot read notes: ${(e as Error).message}`,
        },
      ],
    };
  }
  const { days, diagnostics } = parseNotes(text);
  return { days, diagnostics: diagnostics.map((d) => ({ ...d, file: config.notes })) };
}
