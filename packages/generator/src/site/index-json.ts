import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Trip, TripIndex, TripSummary } from "@retrace/shared";
import type { Diagnostic } from "../diagnostics.ts";
import { readJsonFile, writeJsonIfChanged } from "./json.ts";
import { TRIPS_DIR } from "./trip-folder.ts";

/** Summary of a trip for index.json; cover paths are relative to the site root. */
export function summarizeTrip(trip: Trip): TripSummary {
  const media = Object.values(trip.media);
  const coverMedia = trip.cover === undefined ? undefined : trip.media[trip.cover];
  const prefix = `${TRIPS_DIR}/${trip.slug}/`;
  const cover =
    coverMedia &&
    (coverMedia.type === "photo"
      ? { thumb: prefix + coverMedia.thumb, display: prefix + coverMedia.display }
      : { thumb: prefix + coverMedia.posterThumb, display: prefix + coverMedia.poster });
  return {
    slug: trip.slug,
    title: trip.title,
    startDate: trip.startDate,
    endDate: trip.endDate,
    dayCount: trip.days.length,
    photoCount: media.filter((m) => m.type === "photo").length,
    videoCount: media.filter((m) => m.type === "video").length,
    ...(cover && { cover: { ...cover, ...(coverMedia.color && { color: coverMedia.color }) } }),
  };
}

/**
 * Rebuilds trips/index.json from all trips/<slug>/trip.json (SPEC section 9). Unreadable or
 * incompatible trip.json files are skipped with a warning.
 */
export async function rebuildIndex(
  siteDir: string,
  generatedAt = new Date().toISOString(),
): Promise<{ index: TripIndex; written: boolean; diagnostics: Diagnostic[] }> {
  const tripsDir = path.join(siteDir, TRIPS_DIR);
  const diagnostics: Diagnostic[] = [];
  const summaries: TripSummary[] = [];
  const entries = await readdir(tripsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const file = path.join(tripsDir, entry.name, "trip.json");
    const trip = await readJsonFile<Trip>(file);
    if (!trip) {
      diagnostics.push({
        severity: "warning",
        file,
        message: "missing or unreadable, not listed in index.json",
      });
    } else if (trip.schemaVersion !== 1) {
      diagnostics.push({
        severity: "warning",
        file,
        message: `schemaVersion ${String(trip.schemaVersion)} is not supported, not listed in index.json`,
      });
    } else {
      summaries.push(summarizeTrip(trip));
    }
  }
  summaries.sort((a, b) =>
    a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : a.slug < b.slug ? -1 : 1,
  );
  const index: TripIndex = { schemaVersion: 1, generatedAt, trips: summaries };
  const written = await writeJsonIfChanged(path.join(tripsDir, "index.json"), index, {
    pretty: true,
  });
  return { index, written, diagnostics };
}
