import { Decoder, Stream } from "@garmin/fitsdk";
import { semicirclesToDegrees } from "./geo.ts";

/** A positioned FIT record. */
export interface TrackRecord {
  /** Epoch milliseconds (FIT timestamps are UTC) */
  t: number;
  lat: number;
  lon: number;
  /** Meters; `enhancedAltitude` if present */
  ele: number | null;
  /** Cumulative distance in meters, if the device recorded it */
  distance: number | null;
}

export interface TrackSession {
  sport?: string;
  totalDistance?: number;
  totalTimerTime?: number;
  totalAscent?: number;
  totalDescent?: number;
}

export interface ParsedFit {
  /** Sorted by time, one per timestamp, positioned records only */
  records: TrackRecord[];
  /** Totals over all sessions of the file */
  session: TrackSession;
  /** Non-fatal problems, e.g. a failed CRC check */
  problems: string[];
}

/** Decodes a FIT file with Garmin's SDK (SPEC section 8.7). Throws if it isn't a FIT file. */
export function parseFit(data: Uint8Array): ParsedFit {
  const stream = Stream.fromBuffer(data);
  if (!Decoder.isFIT(stream)) throw new Error("not a FIT file");
  const decoder = new Decoder(stream);
  const problems: string[] = [];
  if (!decoder.checkIntegrity()) problems.push("the file failed its integrity check (truncated?)");
  const { messages, errors } = decoder.read({
    convertDateTimesToDates: true,
    convertTypesToStrings: true,
  });
  problems.push(...errors.map((e) => e.message));

  const byTime = new Map<number, TrackRecord>();
  for (const r of messages.recordMesgs ?? []) {
    const t = r.timestamp instanceof Date ? r.timestamp.getTime() : undefined;
    if (t === undefined || typeof r.positionLat !== "number" || typeof r.positionLong !== "number")
      continue;
    const lat = semicirclesToDegrees(r.positionLat);
    const lon = semicirclesToDegrees(r.positionLong);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) continue;
    const ele = finite(r.enhancedAltitude) ?? finite(r.altitude) ?? null;
    byTime.set(t, { t, lat, lon, ele, distance: finite(r.distance) ?? null });
  }
  const records = [...byTime.values()].sort((a, b) => a.t - b.t);

  const sessions = messages.sessionMesgs ?? [];
  const sum = (key: "totalDistance" | "totalTimerTime" | "totalAscent" | "totalDescent") => {
    const values = sessions.map((s) => finite(s[key])).filter((v) => v !== undefined);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) : undefined;
  };
  // With convertTypesToStrings, enums are names like "hiking"; numbers are unknown values.
  const sport = sessions
    .map((s): unknown => s.sport)
    .find((s): s is string => typeof s === "string" && s !== "generic");
  const session: TrackSession = {};
  for (const key of ["totalDistance", "totalTimerTime", "totalAscent", "totalDescent"] as const) {
    const value = sum(key);
    if (value !== undefined) session[key] = value;
  }
  if (sport) session.sport = sport;
  return { records, session, problems };
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
