import { loadConfig } from "../config.ts";
import type { TripConfig } from "../config.ts";
import { countBySeverity, displayPath, formatReport, isFailure } from "../diagnostics.ts";
import type { Diagnostic } from "../diagnostics.ts";
import { ExitCode } from "../exit-codes.ts";
import { loadNotes } from "../notes/load.ts";
import { consoleOutput } from "../output.ts";
import type { Output } from "../output.ts";

export interface CheckOptions {
  strict?: boolean;
  verbose?: boolean;
}

/** `retrace check <config.json>`: validates config and notes and prints the report (SPEC section 4). */
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

  const { days, diagnostics } = await loadNotes(config);
  const all = [...configDiagnostics, ...diagnostics];
  const entryCount = days.reduce((sum, day) => sum + day.entries.length, 0);
  out.log(`Notes: ${plural(days.length, "day")}, ${plural(entryCount, "entry", "entries")}`);
  printReport(out, all, strict);
  return isFailure(all, strict) ? ExitCode.ValidationError : ExitCode.Success;
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
  out.log(`Cache:    ${config.cacheDir}`);
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
