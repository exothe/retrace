import { copyFile, mkdir, readdir, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import type { Trip } from "@retrace/shared";
import { MEDIA_DIR, mediaFileNames } from "../trip/assemble.ts";
import type { ProcessedMedia } from "../process/process-media.ts";
import { writeJsonIfChanged } from "./json.ts";

export const TRIPS_DIR = "trips";

export function tripDir(siteDir: string, slug: string): string {
  return path.join(siteDir, TRIPS_DIR, slug);
}

export interface TripFolderResult {
  copied: number;
  removed: number;
  tripJsonWritten: boolean;
}

/**
 * Writes `trips/<slug>/`: copies the processed media from the cache into `media/`, deletes
 * media files the trip no longer references, and writes trip.json (SPEC sections 8.5, 9).
 */
export async function writeTripFolder(
  siteDir: string,
  trip: Trip,
  processed: readonly ProcessedMedia[],
): Promise<TripFolderResult> {
  const dir = tripDir(siteDir, trip.slug);
  const mediaDir = path.join(dir, MEDIA_DIR);
  await mkdir(mediaDir, { recursive: true });

  const wanted = new Map<string, string>();
  for (const p of processed) {
    const names = mediaFileNames(p);
    for (const [key, name] of Object.entries(names)) {
      wanted.set(name, (p.files as Record<string, string>)[key]!);
    }
  }

  let copied = 0;
  for (const [name, source] of wanted) {
    if (await copyIfChanged(source, path.join(mediaDir, name))) copied++;
  }

  let removed = 0;
  for (const name of await readdir(mediaDir)) {
    if (!wanted.has(name)) {
      await rm(path.join(mediaDir, name), { recursive: true, force: true });
      removed++;
    }
  }

  const tripJsonWritten = await writeJsonIfChanged(path.join(dir, "trip.json"), trip, {
    pretty: false,
  });
  return { copied, removed, tripJsonWritten };
}

/**
 * Copies unless the target has the same size and modification time. File names are derived
 * from the source content, not the settings, so a changed setting (e.g. quality) keeps the name;
 * copying the cache file's modification time along tells such versions apart.
 */
async function copyIfChanged(source: string, target: string): Promise<boolean> {
  const [from, to] = await Promise.all([stat(source), stat(target).catch(() => undefined)]);
  // utimes keeps millisecond precision at best, so allow rounding differences.
  if (to && to.size === from.size && Math.abs(to.mtimeMs - from.mtimeMs) <= 1) {
    return false;
  }
  await copyFile(source, target);
  await utimes(target, from.atime, from.mtime);
  return true;
}
