import { randomUUID } from "node:crypto";
import os from "node:os";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { settingsHash } from "../cache.ts";
import type { Cache } from "../cache.ts";
import { mapLimit } from "../concurrency.ts";
import type { TripConfig } from "../config.ts";
import type { Diagnostic } from "../diagnostics.ts";
import type { MediaItem } from "../media/scan.ts";
import type { Output } from "../output.ts";
import { IMAGE_VERSION, renderImage } from "./images.ts";
import type { ImageInfo } from "./images.ts";
import { POSTER_VERSION, VIDEO_VERSION, extractPoster, transcodeVideo } from "./videos.ts";
import type { VideoInfo } from "./videos.ts";

/** A media item with its processed files (absolute paths in the cache). */
export type ProcessedMedia =
  | {
      item: MediaItem;
      type: "photo";
      files: { thumb: string; display: string };
      info: ImageInfo;
    }
  | {
      item: MediaItem;
      type: "video";
      files: { video: string; poster: string; posterThumb: string };
      info: ImageInfo & VideoInfo;
    };

export interface ProcessResult {
  /** In the order of the input; failed items are left out */
  processed: ProcessedMedia[];
  diagnostics: Diagnostic[];
  stats: { processed: number; cached: number; failed: number };
}

const VIDEO_CONCURRENCY = 2;

/**
 * Processes photos and videos into the cache (SPEC sections 8.2–8.4). Each output lives in a
 * folder keyed by content hash, a hash of the settings that affect it and a processing version,
 * so changing e.g. `images.quality` re-renders images and posters but doesn't re-encode videos.
 * A file that can't be processed is skipped with a warning.
 */
export async function processMedia(
  items: readonly MediaItem[],
  config: TripConfig,
  cache: Cache,
  out: Output,
): Promise<ProcessResult> {
  const diagnostics: Diagnostic[] = [];
  const stats = { processed: 0, cached: 0, failed: 0 };
  const images = items.filter((item) => item.kind === "photo");
  const videos = items.filter((item) => item.kind === "video");
  const imageKey = `img-${settingsHash(config.images)}-v${IMAGE_VERSION}`;
  const videoKey = `vid-${settingsHash(config.videos)}-v${VIDEO_VERSION}`;
  const posterKey = `poster-${settingsHash({ ...config.images, ...config.videos })}-v${POSTER_VERSION}`;

  const fail = (item: MediaItem, error: unknown) => {
    stats.failed++;
    diagnostics.push({
      severity: "warning",
      file: item.path,
      message: `skipped, cannot process: ${(error as Error).message}`,
    });
    return undefined;
  };

  // libvips is multithreaded itself; with one image per core, one thread per image is enough.
  const previousConcurrency = sharp.concurrency();
  sharp.concurrency(1);
  let done = 0;
  const processedImages = await mapLimit(images, os.availableParallelism(), async (item) => {
    out.progress(`Images ${++done}/${images.length} ${path.basename(item.path)}`);
    try {
      const { dir, info, fresh } = await cached<ImageInfo>(
        cacheEntry(cache, item.hash, imageKey),
        cache.enabled,
        (temp) => renderImage(item.path, config.images, temp),
      );
      stats[fresh ? "processed" : "cached"]++;
      return {
        item,
        type: "photo" as const,
        files: { thumb: path.join(dir, "thumb.webp"), display: path.join(dir, "display.webp") },
        info,
      };
    } catch (error) {
      return fail(item, error);
    }
  });
  sharp.concurrency(previousConcurrency);

  done = 0;
  const processedVideos = await mapLimit(videos, VIDEO_CONCURRENCY, async (item) => {
    const index = ++done;
    const label = `Videos ${index}/${videos.length} ${path.basename(item.path)}`;
    out.progress(label);
    try {
      const video = await cached<VideoInfo>(
        cacheEntry(cache, item.hash, videoKey),
        cache.enabled,
        (temp) =>
          transcodeVideo(config, item.path, config.videos, path.join(temp, "video.mp4"), (f) =>
            out.progress(`${label} ${Math.round(f * 100)}%`),
          ),
      );
      const videoFile = path.join(video.dir, "video.mp4");
      const poster = await cached<ImageInfo>(
        cacheEntry(cache, item.hash, posterKey),
        cache.enabled,
        (temp) =>
          extractPoster(
            config.ffmpegPath,
            videoFile,
            video.info.durationSeconds,
            config.images,
            temp,
          ),
      );
      stats[video.fresh || poster.fresh ? "processed" : "cached"]++;
      return {
        item,
        type: "video" as const,
        files: {
          video: videoFile,
          poster: path.join(poster.dir, "poster.webp"),
          posterThumb: path.join(poster.dir, "poster-thumb.webp"),
        },
        // The poster has the video's dimensions; the video's are authoritative.
        info: { ...poster.info, ...video.info },
      };
    } catch (error) {
      return fail(item, error);
    }
  });

  const byId = new Map(
    [...processedImages, ...processedVideos]
      .filter((p): p is ProcessedMedia => p !== undefined)
      .map((p) => [p.item.id, p]),
  );
  const processed = items.flatMap((item) => byId.get(item.id) ?? []);
  return { processed, diagnostics, stats };
}

function cacheEntry(cache: Cache, hash: string, key: string): string {
  return path.join(cache.dir, "processed", hash.slice(0, 2), hash, key);
}

/**
 * Returns the cached output folder `dir`, or creates it with `make`, which writes its files into
 * a temporary folder and returns the info stored as `info.json`. The folder is renamed into
 * place only when complete, so an interrupted run never leaves a partial entry.
 */
async function cached<T>(
  dir: string,
  useCache: boolean,
  make: (tempDir: string) => Promise<T>,
): Promise<{ dir: string; info: T; fresh: boolean }> {
  const infoFile = path.join(dir, "info.json");
  if (useCache) {
    try {
      return { dir, info: JSON.parse(await readFile(infoFile, "utf8")) as T, fresh: false };
    } catch {
      // not cached yet
    }
  }
  const temp = `${dir}.${randomUUID()}.tmp`;
  await mkdir(temp, { recursive: true });
  try {
    const info = await make(temp);
    await writeFile(path.join(temp, "info.json"), JSON.stringify(info));
    await rm(dir, { recursive: true, force: true });
    await rename(temp, dir);
    return { dir, info, fresh: true };
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
}

/** Total size of all files below `dir`, in bytes. */
export async function folderSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += (await stat(path.join(entry.parentPath, entry.name))).size;
  }
  return total;
}
