import path from "node:path";
import { DateTime, FixedOffsetZone } from "luxon";
import type { Zone } from "luxon";
import type { MediaKind } from "./discover.ts";
import type { RawMetadata } from "./metadata.ts";

export type TimestampSource =
  | "exif-offset" // DateTimeOriginal with offset: exact
  | "exif-local" // DateTimeOriginal in the trip timezone
  | "create-date" // CreateDate (photos), with or without offset
  | "quicktime-tz" // QuickTime CreationDate with offset: exact
  | "quicktime" // QuickTime CreateDate / MediaCreateDate, UTC by default
  | "filename"
  | "mtime";

export interface TimestampOptions {
  /** IANA name of the trip timezone */
  timezone: string;
  videoTimesAreUtc: boolean;
  /** Seconds, keyed by trimmed "<Make> <Model>" or "<Model>" */
  cameraOffsets: Record<string, number>;
}

export interface TimestampInput {
  kind: MediaKind;
  /** File name or path; only the base name is used */
  file: string;
  /** File modification time */
  mtime: Date;
  metadata: RawMetadata;
}

export interface ResolvedTimestamp {
  /** UTC, with the camera offset applied */
  instant: DateTime;
  source: TimestampSource;
  /** "<Make> <Model>", if known */
  camera?: string;
  /** The cameraOffsets key that matched, if any */
  cameraOffsetKey?: string;
}

/** Resolves when a photo or video was taken (SPEC section 7). */
export function resolveTimestamp(
  input: TimestampInput,
  options: TimestampOptions,
): ResolvedTimestamp {
  const zone = options.timezone;
  const m = input.metadata;
  const found =
    input.kind === "photo"
      ? first(
          () =>
            withSource(
              parseExifDate(m.dateTimeOriginal, m.offsetTimeOriginal, m.subSecTimeOriginal, zone),
              (exact) => (exact ? "exif-offset" : "exif-local"),
            ),
          () =>
            withSource(
              parseExifDate(m.createDate, m.offsetTimeDigitized, m.subSecTimeDigitized, zone),
              () => "create-date",
            ),
        )
      : first(
          () =>
            onlyExact(
              parseExifDate(m.quickTimeCreationDate, undefined, undefined, zone),
              "quicktime-tz",
            ),
          () => {
            const videoZone = options.videoTimesAreUtc ? "UTC" : zone;
            return withSource(
              parseExifDate(m.quickTimeCreateDate, undefined, undefined, videoZone) ??
                parseExifDate(m.quickTimeMediaCreateDate, undefined, undefined, videoZone),
              () => "quicktime",
            );
          },
        );
  const resolved = found ??
    withSource(parseFileName(input.file, zone), () => "filename") ?? {
      instant: DateTime.fromJSDate(input.mtime, { zone: "utc" }),
      source: "mtime" as const,
    };

  const camera = cameraName(m.make, m.model);
  const offsetKey = findCameraOffset(m.make, m.model, options.cameraOffsets);
  const offset = offsetKey === undefined ? 0 : options.cameraOffsets[offsetKey]!;
  return {
    instant: resolved.instant.plus({ seconds: offset }).toUTC(),
    source: resolved.source,
    ...(camera !== undefined && { camera }),
    ...(offsetKey !== undefined && { cameraOffsetKey: offsetKey }),
  };
}

interface Parsed {
  instant: DateTime;
  /** Whether the value carried its own offset */
  exact: boolean;
}

function first(
  ...candidates: (() => { instant: DateTime; source: TimestampSource } | undefined)[]
) {
  for (const candidate of candidates) {
    const result = candidate();
    if (result) return result;
  }
  return undefined;
}

function withSource(
  parsed: Parsed | undefined,
  source: (exact: boolean) => TimestampSource,
): { instant: DateTime; source: TimestampSource } | undefined {
  return parsed && { instant: parsed.instant, source: source(parsed.exact) };
}

function onlyExact(parsed: Parsed | undefined, source: TimestampSource) {
  return parsed?.exact ? { instant: parsed.instant, source } : undefined;
}

const EXIF_DATE =
  /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const OFFSET = /^(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parses an EXIF/QuickTime date like "2026:10:23 09:15:12", optionally with fractional seconds
 * and an offset ("+01:00", "Z") either inline or in the separate offset and subsecond tags.
 * Without an offset, the value is interpreted in `zone`. Returns undefined for missing or
 * placeholder values like "0000:00:00 00:00:00".
 */
export function parseExifDate(
  value: string | undefined,
  offset: string | undefined,
  subSec: string | undefined,
  zone: string,
): Parsed | undefined {
  const match = value === undefined ? null : EXIF_DATE.exec(value.trim());
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s, fraction, inlineOffset] = match;
  if (+y! < 1900) return undefined; // "0000:00:00 00:00:00" and similar placeholders

  const offsetText =
    inlineOffset ?? (offset && OFFSET.test(offset.trim()) ? offset.trim() : undefined);
  const parsedZone: Zone | string = offsetText === undefined ? zone : parseOffsetZone(offsetText);
  const digits = fraction ?? (subSec && /^\d+$/.test(subSec.trim()) ? subSec.trim() : undefined);
  const millisecond = digits === undefined ? 0 : Math.round(Number(`0.${digits}`) * 1000) % 1000;

  const instant = DateTime.fromObject(
    { year: +y!, month: +mo!, day: +d!, hour: +h!, minute: +mi!, second: +(s ?? 0), millisecond },
    { zone: parsedZone },
  );
  if (!instant.isValid) return undefined;
  return { instant: instant.toUTC(), exact: offsetText !== undefined };
}

function parseOffsetZone(text: string): Zone {
  if (text.toUpperCase() === "Z") return FixedOffsetZone.utcInstance;
  const sign = text.startsWith("-") ? -1 : 1;
  const digits = text.slice(1).replace(":", "");
  return FixedOffsetZone.instance(sign * (+digits.slice(0, 2) * 60 + +digits.slice(2, 4)));
}

const PIXEL_NAME = /^PXL_(\d{8})_(\d{6})(\d{3})?/i;
const PREFIXED_NAME = /^[A-Z]+_(\d{8})_(\d{6})/i;
const SAMSUNG_NAME = /^(\d{8})_(\d{6})/;

/**
 * Timestamps from file names (SPEC section 7.3): `PXL_YYYYMMDD_HHMMSSmmm` is UTC;
 * `IMG_`/`VID_`/`PANO_`/`MVIMG_`… `YYYYMMDD_HHMMSS` and plain `YYYYMMDD_HHMMSS` are local.
 */
export function parseFileName(file: string, zone: string): Parsed | undefined {
  const name = path.basename(file);
  const pixel = PIXEL_NAME.exec(name);
  if (pixel) return fromDigits(pixel[1]!, pixel[2]!, pixel[3], "UTC");
  const local = PREFIXED_NAME.exec(name) ?? SAMSUNG_NAME.exec(name);
  if (local) return fromDigits(local[1]!, local[2]!, undefined, zone);
  return undefined;
}

function fromDigits(date: string, time: string, millis: string | undefined, zone: string) {
  const instant = DateTime.fromObject(
    {
      year: +date.slice(0, 4),
      month: +date.slice(4, 6),
      day: +date.slice(6, 8),
      hour: +time.slice(0, 2),
      minute: +time.slice(2, 4),
      second: +time.slice(4, 6),
      millisecond: millis === undefined ? 0 : +millis,
    },
    { zone },
  );
  return instant.isValid && instant.year >= 1900
    ? { instant: instant.toUTC(), exact: zone === "UTC" }
    : undefined;
}

function cameraName(make: string | undefined, model: string | undefined): string | undefined {
  const name = [make?.trim(), model?.trim()].filter(Boolean).join(" ");
  return name === "" ? undefined : name;
}

/** Matches "<Make> <Model>" first, then "<Model>" (SPEC section 7.4). */
export function findCameraOffset(
  make: string | undefined,
  model: string | undefined,
  offsets: Record<string, number>,
): string | undefined {
  const m = model?.trim();
  const full = cameraName(make, model);
  if (full !== undefined && Object.hasOwn(offsets, full)) return full;
  if (m && Object.hasOwn(offsets, m)) return m;
  return undefined;
}
