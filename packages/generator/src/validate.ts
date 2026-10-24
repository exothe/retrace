import path from "node:path";
import { Cache } from "./cache.ts";
import type { TripConfig } from "./config.ts";
import { assignDay, buildDayWindows } from "./days/windows.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { mediaDiagnostics } from "./media/check-media.ts";
import type { MetadataReader } from "./media/metadata.ts";
import { scanMedia } from "./media/scan.ts";
import type { MediaItem, MediaScan } from "./media/scan.ts";
import { loadNotes } from "./notes/load.ts";
import type { NoteDay } from "./notes/parse.ts";
import type { Output } from "./output.ts";

export interface Validation {
  days: NoteDay[];
  scan: MediaScan;
  cache: Cache;
  /** Media id of the cover, if there is any photo or video */
  cover?: string;
  /** Notes, media and cover diagnostics (not the config's) */
  diagnostics: Diagnostic[];
}

export interface ValidateOptions {
  /** False with --no-cache */
  cache?: boolean;
  out: Output;
  /** For tests; defaults to exiftool */
  reader?: MetadataReader;
}

/** Everything `check` does and `build` does first: notes, media metadata, related warnings. */
export async function validateTrip(
  config: TripConfig,
  options: ValidateOptions,
): Promise<Validation> {
  const notes = await loadNotes(config);
  const cache = await Cache.open(config.cacheDir, { enabled: options.cache ?? true });
  const scan = await scanMedia(config, {
    cache,
    out: options.out,
    ...(options.reader && { reader: options.reader }),
  });
  const diagnostics = [
    ...notes.diagnostics,
    ...mediaDiagnostics(notes.days, scan.media, config.timezone, config.notes),
    ...scan.diagnostics,
  ];
  const cover = resolveCover(config, scan.media);
  if (cover.diagnostic) diagnostics.push(cover.diagnostic);
  if (notes.days.length === 0 && scan.media.length === 0) {
    diagnostics.push({
      severity: "error",
      file: config.notes,
      message: "the trip has no days: no day headings and no photos or videos",
    });
  }
  return {
    days: notes.days,
    scan,
    cache,
    ...(cover.id !== undefined && { cover: cover.id }),
    diagnostics,
  };
}

/**
 * The cover (SPEC section 6): the media item whose file name is `cover` (also matching the
 * names of identical duplicates), else the first photo, else the first video.
 */
export function resolveCover(
  config: Pick<TripConfig, "cover" | "configFile">,
  media: readonly MediaItem[],
): { id?: string; diagnostic?: Diagnostic } {
  const fallback = media.find((m) => m.kind === "photo") ?? media[0];
  const fallbackId = fallback === undefined ? {} : { id: fallback.id };
  if (config.cover === undefined) return fallbackId;
  const wanted = config.cover.normalize("NFC");
  const match = media.find((m) =>
    [m.path, ...m.duplicates].some((p) => path.basename(p).normalize("NFC") === wanted),
  );
  if (match) return { id: match.id };
  return {
    ...fallbackId,
    diagnostic: {
      severity: "warning",
      file: config.configFile,
      message: `cover: "${config.cover}" is not among the photos and videos, using the first photo`,
    },
  };
}

/** Number of distinct dates that only have media. */
export function countMediaOnlyDays(
  days: readonly NoteDay[],
  media: readonly MediaItem[],
  zone: string,
): number {
  const windows = buildDayWindows(days, zone);
  return new Set(
    media
      .map((item) => assignDay(item.takenAt, windows, zone))
      .filter((day) => !day.hasNotes)
      .map((day) => day.date),
  ).size;
}
