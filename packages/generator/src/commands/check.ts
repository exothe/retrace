import path from "node:path";
import { Cache } from "../cache.ts";
import { loadConfig } from "../config.ts";
import type { TripConfig } from "../config.ts";
import { assignDay, buildDayWindows } from "../days/windows.ts";
import { countBySeverity, displayPath, formatReport, isFailure } from "../diagnostics.ts";
import type { Diagnostic } from "../diagnostics.ts";
import { ExitCode } from "../exit-codes.ts";
import { mediaDiagnostics } from "../media/check-media.ts";
import { summarizeUnsupported } from "../media/discover.ts";
import type { MetadataReader } from "../media/metadata.ts";
import { scanMedia } from "../media/scan.ts";
import type { MediaScan } from "../media/scan.ts";
import { loadNotes } from "../notes/load.ts";
import type { NoteDay } from "../notes/parse.ts";
import { consoleOutput } from "../output.ts";
import type { Output } from "../output.ts";

export interface CheckOptions {
  strict?: boolean;
  verbose?: boolean;
  /** False with --no-cache */
  cache?: boolean;
  /** For tests; defaults to exiftool */
  reader?: MetadataReader;
}

/**
 * `retrace check <config.json>`: validates config and notes, reads media metadata for the
 * media-related warnings, and prints the report (SPEC section 4). Writes no output, only the
 * metadata cache.
 */
export async function runCheck(
  configFile: string,
  options: CheckOptions = {},
  out: Output = consoleOutput,
): Promise<ExitCode> {
  const strict = options.strict ?? false;
  const { config, diagnostics: configDiagnostics } = await loadConfig(configFile);
  if (!config) {
    printReport(out, configDiagnostics, strict);
    return ExitCode.ValidationError;
  }
  if (options.verbose) printConfig(out, config);

  const notes = await loadNotes(config);
  const cache = await Cache.open(config.cacheDir, { enabled: options.cache ?? true });
  const scan = await scanMedia(config, {
    cache,
    out,
    ...(options.reader && { reader: options.reader }),
  });
  const all = [
    ...configDiagnostics,
    ...notes.diagnostics,
    ...mediaDiagnostics(notes.days, scan.media, config.timezone, config.notes),
    ...scan.diagnostics,
  ];

  printSummary(out, config, notes.days, scan, options.verbose ?? false);
  printReport(out, all, strict);
  return isFailure(all, strict) ? ExitCode.ValidationError : ExitCode.Success;
}

function printSummary(
  out: Output,
  config: TripConfig,
  days: NoteDay[],
  scan: MediaScan,
  verbose: boolean,
) {
  const windows = buildDayWindows(days, config.timezone);
  const mediaOnly = new Set(
    scan.media
      .map((item) => assignDay(item.takenAt, windows, config.timezone))
      .filter((day) => !day.hasNotes)
      .map((day) => day.date),
  );
  const entryCount = days.reduce((sum, day) => sum + day.entries.length, 0);
  const photos = scan.media.filter((item) => item.kind === "photo").length;
  const videos = scan.media.length - photos;

  if (verbose) {
    for (const item of scan.media) {
      const local = item.takenAt.setZone(config.timezone).toFormat("yyyy-MM-dd HH:mm:ss");
      const camera = item.camera ? `  [${item.camera}]` : "";
      out.log(`  ${local}  ${item.timestampSource.padEnd(12)}  ${displayPath(item.path)}${camera}`);
    }
    for (const file of scan.unsupported) out.log(`  unsupported: ${displayPath(file)}`);
  }

  out.log(
    `Notes: ${plural(days.length, "day")}, ${plural(entryCount, "entry", "entries")}` +
      (mediaOnly.size > 0 ? `; ${mediaOnly.size} more media-only` : ""),
  );
  out.log(
    `Media: ${plural(photos, "photo")}, ${plural(videos, "video")}, ` +
      `${plural(scan.tracks.length, "track")}` +
      (scan.unsupported.length > 0
        ? `; ${plural(scan.unsupported.length, "unsupported file")} ` +
          `(${summarizeUnsupported(scan.unsupported)})`
        : ""),
  );
}

function printReport(out: Output, diagnostics: Diagnostic[], strict: boolean) {
  for (const line of formatReport(diagnostics)) out.log(line);
  const { error, warning } = countBySeverity(diagnostics);
  const failedByStrict = strict && error === 0 && warning > 0;
  out.log(
    `${plural(error, "error")}, ${plural(warning, "warning")}` +
      (failedByStrict ? " (warnings are errors with --strict)" : ""),
  );
}

function printConfig(out: Output, config: TripConfig) {
  out.log(`Config:   ${displayPath(config.configFile)}`);
  out.log(`Trip:     ${config.title} (${config.slug}), ${config.timezone}`);
  out.log(`Notes:    ${displayPath(config.notes)}`);
  for (const p of config.media) out.log(`Media:    ${displayPath(p)}`);
  for (const p of config.tracks) out.log(`Tracks:   ${displayPath(p)}`);
  out.log(`Output:   ${displayPath(config.output)}`);
  out.log(`Cache:    ${displayPath(config.cacheDir)}${path.sep}`);
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
