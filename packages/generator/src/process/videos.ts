import path from "node:path";
import type { TripConfig } from "../config.ts";
import { probeVideo, scaledSize } from "./ffmpeg.ts";
import { renderImage } from "./images.ts";
import type { ImageInfo, ImageSettings } from "./images.ts";
import { runProcess } from "./run.ts";

/** Bump when video transcoding changes, so cached outputs are regenerated. */
export const VIDEO_VERSION = 1;
/** Bump when poster extraction changes. */
export const POSTER_VERSION = 1;

export type VideoSettings = TripConfig["videos"];

export interface VideoInfo {
  width: number;
  height: number;
  durationSeconds: number;
}

/**
 * Transcodes to H.264/AAC MP4 with the shorter side at most `maxShortSide`, `+faststart`, and
 * without metadata (SPEC section 8.4). ffmpeg applies the rotation itself (autorotate), so the
 * output is upright and the size is computed from the displayed dimensions.
 */
export async function transcodeVideo(
  tools: { ffmpegPath: string; ffprobePath: string },
  input: string,
  settings: VideoSettings,
  output: string,
  onProgress?: (fraction: number) => void,
): Promise<VideoInfo> {
  const probe = await probeVideo(tools.ffprobePath, input);
  const { width, height } = scaledSize(probe.width, probe.height, settings.maxShortSide);
  await runProcess(
    tools.ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-i",
      input,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-vf",
      `scale=${width}:${height},setsar=1`,
      "-c:v",
      "libx264",
      "-preset",
      settings.preset,
      "-crf",
      String(settings.crf),
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      settings.audioBitrate,
      "-movflags",
      "+faststart",
      "-map_metadata",
      "-1",
      "-map_metadata:s:v",
      "-1",
      "-map_metadata:s:a",
      "-1",
      "-map_chapters",
      "-1",
      "-progress",
      "pipe:1",
      "-nostats",
      "-f",
      "mp4",
      output,
    ],
    {
      onStdoutLine: (line) => {
        const match = /^out_time_us=(\d+)/.exec(line);
        if (match && onProgress && probe.durationSeconds > 0) {
          onProgress(Math.min(1, Number(match[1]) / 1e6 / probe.durationSeconds));
        }
      },
    },
  );
  return { width, height, durationSeconds: Math.round(probe.durationSeconds * 10) / 10 };
}

/**
 * Poster frame at 1 s (or the first frame for shorter videos), taken from the transcoded
 * video and saved as thumbnail and display image with the image settings.
 */
export async function extractPoster(
  ffmpegPath: string,
  video: string,
  durationSeconds: number,
  settings: ImageSettings,
  dir: string,
): Promise<ImageInfo> {
  const at = durationSeconds > 1 ? "1" : "0";
  const { stdout } = await runProcess(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-ss",
    at,
    "-i",
    video,
    "-frames:v",
    "1",
    "-c:v",
    "png",
    "-f",
    "image2pipe",
    "-",
  ]);
  if (stdout.length === 0) throw new Error(`no frame at ${at} s in ${path.basename(video)}`);
  return renderImage(stdout, settings, dir, { thumb: "poster-thumb.webp", display: "poster.webp" });
}
