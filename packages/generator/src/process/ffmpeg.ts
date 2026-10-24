import { runProcess } from "./run.ts";

export class ToolMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolMissingError";
  }
}

/** Per-OS install instructions for ffmpeg (SPEC section 4). */
export function ffmpegInstallHint(platform: NodeJS.Platform = process.platform): string {
  switch (platform) {
    case "darwin":
      return "Install it with Homebrew: brew install ffmpeg";
    case "win32":
      return (
        "Install it with: winget install Gyan.FFmpeg (then open a new terminal), " +
        'or download a build from https://www.gyan.dev/ffmpeg/builds/ and set "ffmpegPath" ' +
        'and "ffprobePath" in the trip config.'
      );
    default:
      return "Install it with your package manager, e.g. sudo apt install ffmpeg";
  }
}

/**
 * Checks that ffmpeg (with libsvtav1) and ffprobe can be run. Throws a ToolMissingError with an
 * install hint otherwise.
 */
export async function checkFfmpeg(ffmpegPath: string, ffprobePath: string): Promise<void> {
  for (const [name, command] of [
    ["ffmpeg", ffmpegPath],
    ["ffprobe", ffprobePath],
  ] as const) {
    try {
      await runProcess(command, ["-hide_banner", "-version"]);
    } catch (error) {
      const reason =
        (error as NodeJS.ErrnoException).code === "ENOENT" ? "not found" : (error as Error).message;
      throw new ToolMissingError(`${name} (${command}): ${reason}. ${ffmpegInstallHint()}`);
    }
  }
  const { stdout } = await runProcess(ffmpegPath, ["-hide_banner", "-encoders"]);
  if (!/\blibsvtav1\b/.test(stdout.toString("utf8"))) {
    throw new ToolMissingError(
      `ffmpeg (${ffmpegPath}) was built without libsvtav1, which is needed for AV1 video. ` +
        ffmpegInstallHint(),
    );
  }
}

export interface VideoProbe {
  durationSeconds: number;
  /** Displayed dimensions, i.e. after applying the rotation */
  width: number;
  height: number;
  rotation: number;
  hasAudio: boolean;
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number }[];
  disposition?: { attached_pic?: number };
}

/** Duration, dimensions and rotation of a video via ffprobe (SPEC section 8.4). */
export async function probeVideo(ffprobePath: string, file: string): Promise<VideoProbe> {
  const { stdout } = await runProcess(ffprobePath, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    file,
  ]);
  return parseProbe(JSON.parse(stdout.toString("utf8")) as Parameters<typeof parseProbe>[0]);
}

export function parseProbe(data: {
  streams?: FfprobeStream[];
  format?: { duration?: string };
}): VideoProbe {
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  if (!video?.width || !video.height) throw new Error("no video stream");
  const rotation =
    video.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation ??
    Number(video.tags?.rotate ?? 0);
  const sideways = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  const duration = Number(data.format?.duration ?? video.duration ?? NaN);
  return {
    durationSeconds: Number.isFinite(duration) ? duration : 0,
    width: sideways ? video.height : video.width,
    height: sideways ? video.width : video.height,
    rotation,
    hasAudio: streams.some((s) => s.codec_type === "audio"),
  };
}

/**
 * Output dimensions: the shorter side limited to `maxShortSide`, never upscaled, both even
 * (required by yuv420p).
 */
export function scaledSize(
  width: number,
  height: number,
  maxShortSide: number,
): { width: number; height: number } {
  const factor = Math.min(1, maxShortSide / Math.min(width, height));
  const even = (value: number) => Math.max(2, 2 * Math.floor((value * factor) / 2));
  return { width: even(width), height: even(height) };
}
