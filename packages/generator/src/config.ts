import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import envPaths from "env-paths";
import { IANAZone } from "luxon";
import { z } from "zod";
import type { Diagnostic } from "./diagnostics.ts";
import { parseJsonSource } from "./json-source.ts";

/** Trip configuration with defaults applied and all paths absolute (SPEC section 6). */
export interface TripConfig {
  configFile: string;
  title: string;
  slug: string;
  timezone: string;
  notes: string;
  media: string[];
  tracks: string[];
  output: string;
  /** File name of the cover photo */
  cover?: string;
  cacheDir: string;
  /** Absolute path, or a bare command name looked up on PATH */
  ffmpegPath: string;
  ffprobePath: string;
  /** Clock correction in seconds, keyed by trimmed "<Make> <Model>" or "<Model>" */
  cameraOffsets: Record<string, number>;
  videoTimesAreUtc: boolean;
  images: { thumbWidth: number; displayWidth: number; quality: number };
  videos: { maxShortSide: number; crf: number; preset: number; audioBitrate: string };
  trackOptions: { simplifyToleranceMeters: number; geotagToleranceMinutes: number };
}

export interface LoadConfigResult {
  /** Present when there are no errors */
  config?: TripConfig;
  diagnostics: Diagnostic[];
}

const OFFSET = /^([+-])?(\d+):([0-5]\d)(?::([0-5]\d))?$/;

const nonEmpty = z.string().trim().min(1, "must not be empty");
/** A list of paths; a single path is accepted too. */
const pathList = z.preprocess(
  (value) => (typeof value === "string" ? [value] : value),
  z.array(nonEmpty).min(1, "must not be empty"),
);
const positiveInt = z.int().positive();

const schema = z.strictObject({
  title: nonEmpty,
  slug: z.string().regex(/^[a-z0-9-]+$/, "must only contain a-z, 0-9 and -"),
  timezone: z
    .string()
    .refine((zone) => IANAZone.isValidZone(zone), "must be an IANA timezone like Europe/Lisbon"),
  notes: nonEmpty,
  media: pathList,
  tracks: pathList.optional(),
  output: nonEmpty,
  cover: nonEmpty.optional(),
  cacheDir: nonEmpty.optional(),
  ffmpegPath: nonEmpty.optional(),
  ffprobePath: nonEmpty.optional(),
  cameraOffsets: z
    .record(z.string(), z.string().regex(OFFSET, 'must be an offset like "-00:02:30"'))
    .optional(),
  videoTimesAreUtc: z.boolean().default(true),
  images: z
    .strictObject({
      thumbWidth: positiveInt.default(400),
      displayWidth: positiveInt.default(1920),
      quality: z.int().min(1).max(100).default(50),
    })
    .prefault({}),
  videos: z
    .strictObject({
      maxShortSide: z.int().min(2).default(720),
      crf: z.int().min(0).max(63).default(44),
      preset: z
        .int({ error: "must be an SVT-AV1 preset from 0 (slowest) to 13 (fastest)" })
        .min(0)
        .max(13)
        .default(6),
      audioBitrate: z
        .string()
        .regex(/^\d+k$/, 'must be a bitrate like "128k"')
        .default("128k"),
    })
    .prefault({}),
  tracks_options: z
    .strictObject({
      simplifyToleranceMeters: z.number().nonnegative().default(5),
      geotagToleranceMinutes: z.number().nonnegative().default(2),
    })
    .prefault({}),
});

type RawConfig = z.output<typeof schema>;

/** Parses a clock offset like "-00:02:30" or "+1:00" into seconds. */
export function parseOffset(text: string): number {
  const match = OFFSET.exec(text.trim());
  if (!match) throw new Error(`invalid offset "${text}"`);
  const [, sign, h, m, s] = match;
  const seconds = +h! * 3600 + +m! * 60 + +(s ?? 0);
  return sign === "-" ? -seconds : seconds;
}

/** Default cache directory; never inside the (synced) notes folder. */
export function defaultCacheDir(): string {
  return envPaths("retrace", { suffix: "" }).cache;
}

/** Loads, validates and resolves a trip config file. Relative paths resolve against its folder. */
export async function loadConfig(configFile: string): Promise<LoadConfigResult> {
  const file = path.resolve(configFile);
  const diagnostics: Diagnostic[] = [];
  const error = (message: string, line?: number) =>
    diagnostics.push({ severity: "error", file, message, ...(line !== undefined && { line }) });

  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (e) {
    error(`cannot read config file: ${(e as Error).message}`);
    return { diagnostics };
  }

  const source = parseJsonSource(text.replace(/^\uFEFF/, ""));
  if (source.errors.length > 0) {
    for (const e of source.errors) error(`invalid JSON: ${e.message}`, e.line);
    return { diagnostics };
  }
  const lineOf = (keyPath: PropertyKey[]) => source.lineOf(keyPath);

  const parsed = schema.safeParse(source.value, {
    error: (issue) =>
      issue.code === "invalid_type" && issue.input === undefined ? "is required" : undefined,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.code === "unrecognized_keys") {
        for (const key of issue.keys) {
          const keyPath = [...issue.path, key];
          error(`${formatKeyPath(keyPath)}: unknown key`, lineOf(keyPath));
        }
      } else if (issue.path.length === 0) {
        error(`config must be a JSON object (${issue.message})`, 1);
      } else {
        error(`${formatKeyPath(issue.path)}: ${issue.message}`, lineOf(issue.path));
      }
    }
    return { diagnostics: sortByLine(diagnostics) };
  }

  const config = resolveConfig(file, parsed.data);
  await checkPaths(config, source.value as Record<string, unknown>, error, lineOf);
  if (diagnostics.length > 0) return { diagnostics: sortByLine(diagnostics) };
  return { config, diagnostics };
}

function resolveConfig(file: string, raw: RawConfig): TripConfig {
  const dir = path.dirname(file);
  const resolve = (p: string) => path.resolve(dir, p);
  // A bare name like "ffmpeg" is looked up on PATH; anything with a separator is a path.
  const resolveCommand = (p: string | undefined, fallback: string) =>
    p === undefined ? fallback : /[\\/]/.test(p) ? resolve(p) : p;

  return {
    configFile: file,
    title: raw.title,
    slug: raw.slug,
    timezone: raw.timezone,
    notes: resolve(raw.notes),
    media: raw.media.map(resolve),
    tracks: (raw.tracks ?? []).map(resolve),
    output: resolve(raw.output),
    ...(raw.cover !== undefined && { cover: raw.cover }),
    cacheDir: raw.cacheDir === undefined ? defaultCacheDir() : resolve(raw.cacheDir),
    ffmpegPath: resolveCommand(raw.ffmpegPath, "ffmpeg"),
    ffprobePath: resolveCommand(raw.ffprobePath, "ffprobe"),
    cameraOffsets: Object.fromEntries(
      Object.entries(raw.cameraOffsets ?? {}).map(([camera, offset]) => [
        camera.trim(),
        parseOffset(offset),
      ]),
    ),
    videoTimesAreUtc: raw.videoTimesAreUtc,
    images: raw.images,
    videos: raw.videos,
    trackOptions: raw.tracks_options,
  };
}

async function checkPaths(
  config: TripConfig,
  json: Record<string, unknown>,
  error: (message: string, line?: number) => void,
  lineOf: (keyPath: PropertyKey[]) => number | undefined,
): Promise<void> {
  const notes = await statOrUndefined(config.notes);
  if (!notes) error(`notes: file not found: ${config.notes}`, lineOf(["notes"]));
  else if (!notes.isFile()) error(`notes: not a file: ${config.notes}`, lineOf(["notes"]));

  // A plain string is normalized to a one-element list; its line is that of the key itself.
  const checkList = async (key: "media" | "tracks", paths: string[]) => {
    const isList = Array.isArray(json[key]);
    for (const [i, p] of paths.entries()) {
      if (!(await statOrUndefined(p))) {
        const keyPath = isList ? [key, i] : [key];
        error(`${formatKeyPath(keyPath)}: not found: ${p}`, lineOf(keyPath));
      }
    }
  };
  await checkList("media", config.media);
  await checkList("tracks", config.tracks);

  if (isInside(config.cacheDir, path.dirname(config.notes))) {
    error(
      "cacheDir: must not be inside the notes folder, which is synced",
      lineOf("cacheDir" in json ? ["cacheDir"] : ["notes"]),
    );
  }
}

/** Missing keys (no line) first, then by line; stable for equal lines. */
function sortByLine(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}

async function statOrUndefined(p: string) {
  try {
    return await stat(p);
  } catch {
    return undefined;
  }
}

/** Whether `child` is `parent` or below it. */
export function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** ["images", "quality"] -> "images.quality", ["media", 1] -> "media[1]" */
export function formatKeyPath(keyPath: readonly PropertyKey[]): string {
  let out = "";
  for (const key of keyPath) {
    if (typeof key === "number") out += `[${key}]`;
    else {
      const name = String(key);
      const part = /^[A-Za-z_][\w-]*$/.test(name) ? name : JSON.stringify(name);
      out += out === "" ? part : `.${part}`;
    }
  }
  return out;
}
