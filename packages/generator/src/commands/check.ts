import { loadConfig } from "../config.ts";
import { isFailure } from "../diagnostics.ts";
import { ExitCode } from "../exit-codes.ts";
import type { MetadataReader } from "../media/metadata.ts";
import { consoleOutput } from "../output.ts";
import type { Output } from "../output.ts";
import { validateTrip } from "../validate.ts";
import { printConfig, printCounts, printDiagnostics, printValidationSummary } from "./report.ts";

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
    printDiagnostics(out, configDiagnostics);
    printCounts(out, configDiagnostics, strict);
    return ExitCode.ValidationError;
  }
  if (options.verbose) printConfig(out, config);

  const validation = await validateTrip(config, {
    out,
    ...(options.cache !== undefined && { cache: options.cache }),
    ...(options.reader && { reader: options.reader }),
  });
  const all = [...configDiagnostics, ...validation.diagnostics];
  printValidationSummary(out, config, validation, options.verbose ?? false);
  printDiagnostics(out, all);
  printCounts(out, all, strict);
  return isFailure(all, strict) ? ExitCode.ValidationError : ExitCode.Success;
}
