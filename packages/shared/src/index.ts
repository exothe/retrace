// Data schema written by the generator and read by the viewer (SPEC section 9.2).
// Type-only module: it must not contain runtime code, so consumers can import it with
// `import type` without a build step.
//
// All paths are relative to the trip folder unless noted otherwise.
// Bump `schemaVersion` on breaking changes.

export type SchemaVersion = 1;

export interface TripIndex {
  schemaVersion: SchemaVersion;
  /** ISO UTC */
  generatedAt: string;
  /** Sorted by startDate, newest first */
  trips: TripSummary[];
}

export interface TripSummary {
  slug: string;
  title: string;
  /** Local date, e.g. "2026-10-23" */
  startDate: string;
  endDate: string;
  dayCount: number;
  photoCount: number;
  videoCount: number;
  /** Paths relative to the site root */
  cover?: { thumb: string; display: string; color?: string };
}

export interface Trip {
  schemaVersion: SchemaVersion;
  generatedAt: string;
  slug: string;
  title: string;
  /** IANA timezone name */
  timezone: string;
  startDate: string;
  endDate: string;
  /** Media id of the cover photo (for videos: its poster), used for the trip list */
  cover?: string;
  /** Sorted by date */
  days: Day[];
  media: Record<string, Media>;
  tracks: Record<string, Track>;
}

export interface Day {
  /** The heading's date, e.g. "2026-10-24" */
  date: string;
  /** False for media-only days */
  hasNotes: boolean;
  /** Items before the first entry */
  before: TimelineItem[];
  entries: Entry[];
  /** All media of the day with a position */
  mapMediaIds: string[];
}

export interface Entry {
  id: string;
  /** Clock time as written, e.g. "13:30" */
  time: string;
  /** ISO UTC */
  timestamp: string;
  /** Plain text, rendered escaped */
  text: string;
  /** Sorted by time */
  items: TimelineItem[];
}

export type TimelineItem = { kind: "media"; id: string } | { kind: "track"; id: string };

export type GpsSource = "exif" | "track";

export interface MediaBase {
  /** hash12 */
  id: string;
  /** ISO UTC */
  takenAt: string;
  /** "13:42", in the trip timezone */
  localTime: string;
  /** Of the display version */
  width: number;
  height: number;
  /** Dominant color, "#rrggbb" */
  color?: string;
  gps?: { lat: number; lon: number; source: GpsSource };
  /** From the file's metadata (XMP, IPTC or EXIF), plain text */
  title?: string;
  /** From the file's metadata, plain text; omitted when equal to the title */
  caption?: string;
}

export interface Photo extends MediaBase {
  type: "photo";
  thumb: string;
  display: string;
}

export interface Video extends MediaBase {
  type: "video";
  src: string;
  poster: string;
  posterThumb: string;
  durationSeconds: number;
}

export type Media = Photo | Video;

export type TrackPoint = [lat: number, lon: number, ele: number | null, tOffsetSeconds: number];

export type ElevationPoint = [distanceMeters: number, elevationMeters: number];

export interface TrackStats {
  distanceMeters: number;
  durationSeconds: number;
  movingSeconds?: number;
  ascentMeters?: number;
  descentMeters?: number;
  minElevation?: number;
  maxElevation?: number;
}

export interface Track {
  id: string;
  /** ISO UTC */
  start: string;
  end: string;
  /** "09:15", in the trip timezone */
  localStart: string;
  localEnd: string;
  sport?: string;
  stats: TrackStats;
  points: TrackPoint[];
  elevationProfile: ElevationPoint[];
  mediaIds: string[];
}
