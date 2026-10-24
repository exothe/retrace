import { readFile, stat } from "node:fs/promises";
import { DateTime } from "luxon";
import type { Cache } from "../cache.ts";
import { displayPath } from "../diagnostics.ts";
import type { Diagnostic } from "../diagnostics.ts";
import { comparePaths } from "../media/discover.ts";
import type { TrackRecord } from "./fit.ts";
import { parseFit } from "./fit.ts";
import { processTrack } from "./track.ts";
import type { ProcessedTrack } from "./track.ts";

export interface LoadedTrack {
  /** First 12 hex characters of the FIT file's content hash */
  id: string;
  path: string;
  start: DateTime;
  end: DateTime;
  /** Full resolution, for geotagging */
  records: TrackRecord[];
  processed: ProcessedTrack;
}

/**
 * Parses FIT files into tracks (SPEC section 8.7). Each file is one track; identical files are
 * used once. Files that can't be read or have no positions are skipped with a warning. Parsing
 * is fast, so unlike media this isn't cached beyond the file hash.
 */
export async function loadTracks(
  files: readonly string[],
  cache: Cache,
  simplifyToleranceMeters: number,
): Promise<{ tracks: LoadedTrack[]; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const warn = (file: string, message: string) =>
    diagnostics.push({ severity: "warning", file, message });
  const seen = new Map<string, string>();
  const tracks: LoadedTrack[] = [];

  for (const file of [...files].sort(comparePaths)) {
    const hash = await cache.hash(file, await stat(file));
    const duplicateOf = seen.get(hash);
    if (duplicateOf) {
      warn(file, `identical to ${displayPath(duplicateOf)}, skipped`);
      continue;
    }
    seen.set(hash, file);

    let parsed;
    try {
      parsed = parseFit(await readFile(file));
    } catch (error) {
      warn(file, `skipped, cannot read FIT file: ${(error as Error).message}`);
      continue;
    }
    for (const problem of parsed.problems) warn(file, problem);
    if (parsed.records.length < 2) {
      warn(file, "skipped, the track has no GPS positions");
      continue;
    }
    tracks.push({
      id: hash.slice(0, 12),
      path: file,
      start: DateTime.fromMillis(parsed.records[0]!.t, { zone: "utc" }),
      end: DateTime.fromMillis(parsed.records.at(-1)!.t, { zone: "utc" }),
      records: parsed.records,
      processed: processTrack(parsed, simplifyToleranceMeters),
    });
  }
  await cache.save();
  tracks.sort((a, b) => a.start.toMillis() - b.start.toMillis());
  return { tracks, diagnostics };
}
