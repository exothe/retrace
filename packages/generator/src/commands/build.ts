import { loadConfig } from "../config.ts";
import { displayPath, isFailure } from "../diagnostics.ts";
import type { Diagnostic } from "../diagnostics.ts";
import { ExitCode } from "../exit-codes.ts";
import type { MetadataReader } from "../media/metadata.ts";
import { consoleOutput } from "../output.ts";
import type { Output } from "../output.ts";
import { ToolMissingError, checkFfmpeg } from "../process/ffmpeg.ts";
import { folderSize, processMedia } from "../process/process-media.ts";
import { rebuildIndex } from "../site/index-json.ts";
import { tripDir, writeTripFolder } from "../site/trip-folder.ts";
import {
  DEFAULT_VIEWER_DIR,
  ViewerMissingError,
  assertViewerBuilt,
  copyViewer,
} from "../site/viewer.ts";
import { geotag } from "../tracks/geotag.ts";
import { assembleTrip } from "../trip/assemble.ts";
import { validateTrip } from "../validate.ts";
import {
  formatBytes,
  plural,
  printConfig,
  printCounts,
  printDiagnostics,
  printValidationSummary,
} from "./report.ts";

export interface BuildOptions {
  strict?: boolean;
  verbose?: boolean;
  /** False with --no-cache */
  cache?: boolean;
  /** For tests; defaults to packages/viewer/dist */
  viewerDir?: string;
  /** For tests; defaults to exiftool */
  reader?: MetadataReader;
  /** For tests */
  now?: () => Date;
}

/**
 * `retrace build <config.json>` (SPEC section 4): validate, process media (cached), write the
 * trip folder, copy the viewer and rebuild trips/index.json.
 */
export async function runBuild(
  configFile: string,
  options: BuildOptions = {},
  out: Output = consoleOutput,
): Promise<ExitCode> {
  const strict = options.strict ?? false;
  const viewerDir = options.viewerDir ?? DEFAULT_VIEWER_DIR;
  const { config, diagnostics: configDiagnostics } = await loadConfig(configFile);
  if (!config) {
    printDiagnostics(out, configDiagnostics);
    printCounts(out, configDiagnostics, strict);
    return ExitCode.ValidationError;
  }
  if (options.verbose) printConfig(out, config);

  try {
    await checkFfmpeg(config.ffmpegPath, config.ffprobePath);
    await assertViewerBuilt(viewerDir);
  } catch (error) {
    if (error instanceof ToolMissingError || error instanceof ViewerMissingError) {
      out.log(`error: ${error.message}`);
      return ExitCode.RuntimeError;
    }
    throw error;
  }

  const validation = await validateTrip(config, {
    out,
    ...(options.cache !== undefined && { cache: options.cache }),
    ...(options.reader && { reader: options.reader }),
  });
  const diagnostics: Diagnostic[] = [...configDiagnostics, ...validation.diagnostics];
  printValidationSummary(out, config, validation, options.verbose ?? false);
  printDiagnostics(out, diagnostics);
  if (isFailure(diagnostics, strict)) {
    printCounts(out, diagnostics, strict);
    out.log("Build stopped, nothing was written.");
    return ExitCode.ValidationError;
  }

  const result = await processMedia(validation.scan.media, config, validation.cache, out);
  const processedIds = new Set(result.processed.map((p) => p.item.id));
  const cover =
    validation.cover !== undefined && processedIds.has(validation.cover)
      ? validation.cover
      : (result.processed.find((p) => p.type === "photo") ?? result.processed[0])?.item.id;
  const { positions, trackMedia } = geotag(
    result.processed.map((p) => p.item),
    validation.tracks,
    config.trackOptions.geotagToleranceMinutes,
  );
  const trip = assembleTrip({
    slug: config.slug,
    title: config.title,
    timezone: config.timezone,
    days: validation.days,
    media: result.processed,
    tracks: validation.tracks,
    positions,
    trackMedia,
    ...(cover !== undefined && { cover }),
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
  });

  const folder = await writeTripFolder(config.output, trip, result.processed);
  const viewer = await copyViewer(viewerDir, config.output);
  const index = await rebuildIndex(config.output, trip.generatedAt);

  const later = [...result.diagnostics, ...index.diagnostics];
  printDiagnostics(out, later);
  const all = [...diagnostics, ...later];

  const photos = result.processed.filter((p) => p.type === "photo").length;
  const entries = trip.days.reduce((sum, day) => sum + day.entries.length, 0);
  const size = await folderSize(tripDir(config.output, config.slug));
  const { stats } = result;
  out.log(
    `Media: ${stats.processed} processed, ${stats.cached} from cache` +
      (stats.failed > 0 ? `, ${stats.failed} failed` : ""),
  );
  if (options.verbose) {
    out.log(
      `Files: ${folder.copied} media copied, ${folder.removed} removed; ` +
        `trip.json ${folder.tripJsonWritten ? "written" : "unchanged"}; ` +
        `viewer ${viewer.copied} copied, ${viewer.removed} removed; ` +
        `index.json ${index.written ? "written" : "unchanged"}`,
    );
  }
  printCounts(out, all, strict);
  out.log(
    `Built ${config.slug}: ${plural(trip.days.length, "day")}, ` +
      `${plural(entries, "entry", "entries")}, ${plural(photos, "photo")}, ` +
      `${plural(result.processed.length - photos, "video")}, ` +
      `${plural(Object.keys(trip.tracks).length, "track")}, ` +
      `${plural(all.filter((d) => d.severity === "warning").length, "warning")}, ` +
      `${formatBytes(size)} in ${displayPath(tripDir(config.output, config.slug))}`,
  );
  return isFailure(all, strict) ? ExitCode.ValidationError : ExitCode.Success;
}
