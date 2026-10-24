import path from "node:path";
import type { TripConfig } from "../config.ts";
import { countBySeverity, displayPath, formatReport } from "../diagnostics.ts";
import type { Diagnostic } from "../diagnostics.ts";
import { summarizeUnsupported } from "../media/discover.ts";
import type { Output } from "../output.ts";
import type { Validation } from "../validate.ts";
import { countMediaOnlyDays } from "../validate.ts";

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function printDiagnostics(out: Output, diagnostics: readonly Diagnostic[]) {
  for (const line of formatReport(diagnostics)) out.log(line);
}

export function printCounts(out: Output, diagnostics: readonly Diagnostic[], strict: boolean) {
  const { error, warning } = countBySeverity(diagnostics);
  const failedByStrict = strict && error === 0 && warning > 0;
  out.log(
    `${plural(error, "error")}, ${plural(warning, "warning")}` +
      (failedByStrict ? " (warnings are errors with --strict)" : ""),
  );
}

export function printConfig(out: Output, config: TripConfig) {
  out.log(`Config:   ${displayPath(config.configFile)}`);
  out.log(`Trip:     ${config.title} (${config.slug}), ${config.timezone}`);
  out.log(`Notes:    ${displayPath(config.notes)}`);
  for (const p of config.media) out.log(`Media:    ${displayPath(p)}`);
  for (const p of config.tracks) out.log(`Tracks:   ${displayPath(p)}`);
  out.log(`Output:   ${displayPath(config.output)}`);
  out.log(`Cache:    ${displayPath(config.cacheDir)}${path.sep}`);
}

/** The notes and media summary shared by `check` and `build`. */
export function printValidationSummary(
  out: Output,
  config: TripConfig,
  validation: Validation,
  verbose: boolean,
) {
  const { days, scan } = validation;
  if (verbose) {
    for (const item of scan.media) {
      const local = item.takenAt.setZone(config.timezone).toFormat("yyyy-MM-dd HH:mm:ss");
      const camera = item.camera ? `  [${item.camera}]` : "";
      out.log(`  ${local}  ${item.timestampSource.padEnd(12)}  ${displayPath(item.path)}${camera}`);
    }
    for (const file of scan.unsupported) out.log(`  unsupported: ${displayPath(file)}`);
  }
  const mediaOnly = countMediaOnlyDays(days, scan.media, config.timezone);
  const entryCount = days.reduce((sum, day) => sum + day.entries.length, 0);
  const photos = scan.media.filter((item) => item.kind === "photo").length;
  out.log(
    `Notes: ${plural(days.length, "day")}, ${plural(entryCount, "entry", "entries")}` +
      (mediaOnly > 0 ? `; ${mediaOnly} more media-only` : ""),
  );
  out.log(
    `Media: ${plural(photos, "photo")}, ${plural(scan.media.length - photos, "video")}, ` +
      `${plural(scan.tracks.length, "track")}` +
      (scan.unsupported.length > 0
        ? `; ${plural(scan.unsupported.length, "unsupported file")} ` +
          `(${summarizeUnsupported(scan.unsupported)})`
        : ""),
  );
}

/** 1536 -> "1.5 KB" */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}
