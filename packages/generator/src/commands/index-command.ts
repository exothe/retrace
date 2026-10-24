import { stat } from "node:fs/promises";
import path from "node:path";
import { displayPath, isFailure } from "../diagnostics.ts";
import { ExitCode } from "../exit-codes.ts";
import { consoleOutput } from "../output.ts";
import type { Output } from "../output.ts";
import { rebuildIndex } from "../site/index-json.ts";
import { TRIPS_DIR } from "../site/trip-folder.ts";
import { plural, printCounts, printDiagnostics } from "./report.ts";

/** `retrace index <siteDir>`: rebuilds trips/index.json from all trips/<slug>/trip.json. */
export async function runIndex(
  siteDir: string,
  options: { strict?: boolean } = {},
  out: Output = consoleOutput,
): Promise<ExitCode> {
  const dir = path.resolve(siteDir);
  const trips = await stat(path.join(dir, TRIPS_DIR)).catch(() => undefined);
  if (!trips?.isDirectory()) {
    out.log(`error: ${displayPath(dir)} has no ${TRIPS_DIR}/ folder; is it a site directory?`);
    return ExitCode.ValidationError;
  }
  const { index, written, diagnostics } = await rebuildIndex(dir);
  printDiagnostics(out, diagnostics);
  printCounts(out, diagnostics, options.strict ?? false);
  out.log(
    `${displayPath(path.join(dir, TRIPS_DIR, "index.json"))}: ${plural(index.trips.length, "trip")}, ` +
      (written ? "written" : "unchanged"),
  );
  return isFailure(diagnostics, options.strict ?? false)
    ? ExitCode.ValidationError
    : ExitCode.Success;
}
