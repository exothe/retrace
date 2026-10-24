# Retrace – Specification

Retrace turns a vacation's notes, photos, videos and GPS tracks into a static website for re-experiencing each day of the trip. A CLI (the **generator**) processes the source material locally and writes a static site. A React app (the **viewer**), built once, displays it. The finished site is copied manually to a Raspberry Pi and served as static files to desktop and mobile browsers.

The most important feature is the **day timeline**: stepping through a day entry by entry, with the photos and videos taken in between, and GPS tracks where they exist.

## 1. Context and constraints

- The author writes notes in **Obsidian**, in German, in a fixed format (see section 5). The notes live in a Syncthing-synced vault; the generator only reads them.
- The generator runs on **Windows and macOS**. All code must be cross-platform: use `path`, no shell-specific commands, handle CRLF line endings, handle Unicode file names (macOS may return NFD-normalized names; normalize to NFC when comparing).
- The output is hosted on a **Raspberry Pi with 32 GB storage**, so output media is compressed with configurable quality. Originals are never copied to the output.
- The Pi serves static files only (nginx or Caddy). The site must work under any base path with no server configuration: relative URLs and hash routing only.
- GPS tracks come from **FIT files**, and only exist for parts of some days (hikes and similar). Most days have no track. There is no heart rate data.
- Photos are JPEG/PNG and videos are typical phone/camera formats. **No HEIC, no RAW.**
- The viewer UI is in **German**. Code, comments, docs and CLI output are in English.

## 2. Non-goals for v1

Do not build these, but don't make design choices that block them later: curation (hiding photos, favorites, captions), a trip overview with aggregate stats, heart rate, HEIC/RAW, multiple timezones per trip, GPX import, search, authentication, a dynamic backend.

## 3. Repository layout and tech stack

npm workspaces monorepo:

```
retrace/
  package.json              # workspaces, shared scripts
  tsconfig.base.json
  packages/
    shared/                 # TypeScript types for trip.json / index.json (section 9), no runtime deps
    generator/              # CLI
    viewer/                 # React app
  examples/                 # small sample trip for development and tests (see section 12)
  SPEC.md
  README.md
```

General: Node.js current LTS (22 or newer), TypeScript in strict mode, ESM throughout, Vitest for tests, ESLint and Prettier. Pin dependency versions and check the current version of each package before adding it, rather than relying on memory.

**Generator**:
- `commander` for the CLI
- `jsonc-parser` (strict mode, for line numbers in error messages) plus `zod` for config parsing and validation
- `luxon` for all date, time and timezone handling
- `sharp` for image processing
- `exiftool-vendored` for photo and video metadata
- `@garmin/fitsdk` (Garmin's official FIT SDK) for FIT parsing
- `ffmpeg` and `ffprobe` invoked directly via `child_process` (do not use `fluent-ffmpeg`, which is no longer maintained). They must be on `PATH` or set via config.
- `env-paths` for the default cache directory
- `sirv` for the preview server (it supports range requests, which video seeking needs)

**Viewer**:
- React with Vite and TypeScript
- `react-router` with `HashRouter`
- `leaflet` plus `react-leaflet`, with OpenStreetMap tiles
- `yet-another-react-lightbox` with its video plugin
- Tailwind CSS (v4, via `@tailwindcss/vite`) for styling. Light and dark mode via `prefers-color-scheme` (Tailwind's default `dark:` variant).
- The elevation profile is a small hand-written SVG component, so no chart library is needed.
- No external CDNs or fonts. The only external requests at runtime are OSM tiles.

## 4. CLI

Command name: `retrace`.

| Command | Purpose |
|---|---|
| `retrace check <config.json>` | Validate config and notes, and print the report (section 5.4). Reads media metadata to report media-related warnings, but processes and writes nothing. |
| `retrace build <config.json>` | Full run: validate, process media and tracks (cached), write the trip folder, copy the viewer, rebuild `trips/index.json`. |
| `retrace index <siteDir>` | Rebuild `trips/index.json` from all `trips/*/trip.json` in the site directory. `build` does this automatically. |
| `retrace preview [siteDir]` | Serve the site directory locally (default port 4173) for checking before copying to the Pi. |

Flags: `--strict` (warnings fail the run, for both `check` and `build`), `--verbose`, `--no-cache` (reprocess everything).

Exit codes: 0 on success, 1 on validation errors, 2 on runtime failures (e.g. ffmpeg missing).

At startup, `build` checks that `ffmpeg` and `ffprobe` are available and prints a clear install hint per OS if they aren't.

Show progress for media processing (counts and current file). Print a summary at the end: days, entries, photos, videos, tracks, warnings, output size of the trip folder.

## 5. Note format

### 5.1 Example

```markdown
# Verlauf

## 23.10.2026 (Freitag)

* [08:00] Aufgewacht
* [09:10] Raus in die Stadt
* [13:30] Super Mittagessen

## 24.10.2026

- [07:45] Früh los zur Wanderung
* [23:40] Noch eine Bar gefunden
* [00:30] Zurück im Hotel
```

### 5.2 Grammar

- The file is UTF-8 and may have a BOM and CRLF line endings.
- The generator looks for a level-1 heading whose text is `Verlauf` (trimmed, case-insensitive). The section runs until the next level-1 heading or the end of the file. Everything outside the section is ignored.
- **Day heading**: any heading of level 2 or deeper inside the section whose text matches:
  `^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(\(\s*([^)]+?)\s*\))?\s*$`
  The optional parenthesized part is a German weekday: full names `Montag` to `Sonntag` or the abbreviations `Mo Di Mi Do Fr Sa So`, case-insensitive, optionally with a trailing period.
- **Entry**: a line matching
  `^\s*[*-]\s+\[(\d{1,2}):(\d{2})\]\s+(.+?)\s*$`
  with hour 0–23 and minute 0–59. The text is plain text. The viewer renders it escaped, never as HTML or Markdown.
- Blank lines are ignored.
- Everything below a day heading belongs to that day, until the next day heading.

### 5.3 Midnight rollover

Entries keep the order in which they were written. Each entry gets an absolute timestamp, computed in the trip's timezone:

- The first entry of a day is on the heading's date.
- If an entry's clock time is earlier than the previous entry's, and the previous entry is at or after 18:00 and the current one is at or before 06:00, the entry rolls over to the next calendar date. All following entries of that day stay on the rolled-over date. This happens silently.
- Any other backwards jump is a warning (likely a typo), and the entry stays on the current date.
- Equal times are fine.

In the example, `[00:30]` under `24.10.2026` resolves to 25.10.2026 00:30, but it is still shown on the 24.10. page.

### 5.4 Validation

Report lines look like `<file>:<line>: error|warning: <message>`, grouped and sorted by line. Errors stop `build`. Warnings don't, unless `--strict` is set.

Errors:
- No `# Verlauf` heading.
- An entry (or any non-blank line) inside the section before the first day heading. This catches forgotten day headings.
- A non-blank line below a day heading that is neither an entry nor a heading.
- A heading inside the section that isn't a valid day heading.
- An invalid date (e.g. `31.02.2026`) or an invalid time (e.g. `[25:10]`).
- A duplicate day heading (the same date twice).
- Unknown weekday text (e.g. `(Freitg)`).

Warnings:
- The weekday doesn't match the date (e.g. `24.10.2026 (Freitag)`; it's a Samstag).
- Day headings not in ascending order.
- A day heading with no entries.
- A backwards time jump that isn't a rollover (section 5.3).
- Media found on a date with no day heading (computed after reading media metadata; the message names the date and the number of files). This is another hint for a forgotten day heading.
- An entry far outside the time range of the trip's media (more than 2 days away), which hints at a wrong year or month.

Keep the parser a pure function (`parseNotes(text) -> { days, diagnostics }`) with thorough unit tests covering every rule above.

## 6. Trip config

One JSON file per trip (strict JSON: no comments, no trailing commas), e.g. `trip.config.json`; any file name works. The examples avoid naming it `trip.json` so it isn't confused with the generated `trip.json` (section 9). Relative paths resolve relative to the config file. Validate with zod and report errors with the offending key and its line.

```json
{
  "title": "Lissabon 2026",
  "slug": "lissabon-2026",
  "timezone": "Europe/Lisbon",
  "notes": "./Lissabon 2026.md",
  "media": ["./Fotos", "./Videos"],
  "tracks": ["./Tracks"],
  "output": "../site",
  "cover": "IMG_20261023_091512.jpg",
  "cameraOffsets": { "Canon EOS R6": "-00:02:30" },
  "videoTimesAreUtc": true,
  "images": { "thumbWidth": 400, "displayWidth": 1920, "quality": 75 },
  "videos": { "maxShortSide": 720, "crf": 28, "preset": "medium", "audioBitrate": "128k" },
  "tracks_options": { "simplifyToleranceMeters": 5, "geotagToleranceMinutes": 2 },
  "privacyZones": [{ "lat": 48.1371, "lon": 11.5754, "radiusMeters": 500 }]
}
```

| Key | Required | Default | Meaning |
|---|---|---|---|
| `title` | yes | | Trip title |
| `slug` | yes | | `[a-z0-9-]+`, used as folder name and in URLs |
| `timezone` | yes | | IANA name |
| `notes` | yes | | One Markdown file |
| `media` | yes | | Files or folders (folders are scanned recursively) |
| `tracks` | no | | FIT files or folders |
| `output` | yes | | Site directory (shared by all trips) |
| `cover` | no | first photo | File name of the cover photo |
| `cacheDir` | no | OS cache dir from `env-paths("retrace")` | |
| `ffmpegPath`, `ffprobePath` | no | `ffmpeg`, `ffprobe` on `PATH` | |
| `cameraOffsets` | no | | Clock corrections added to the media timestamp; the key matches `"<Make> <Model>"` or `"<Model>"` from EXIF |
| `videoTimesAreUtc` | no | `true` | Section 7.2 |
| `images.thumbWidth` | no | 400 | |
| `images.displayWidth` | no | 1920 | The longest side is limited, for portrait images |
| `images.quality` | no | 75 | WebP quality |
| `videos.maxShortSide` | no | 720 | The shorter side is limited (works for portrait videos) |
| `videos.crf` | no | 28 | libx264 |
| `videos.preset` | no | `medium` | |
| `videos.audioBitrate` | no | `128k` | |
| `tracks_options.simplifyToleranceMeters` | no | 5 | |
| `tracks_options.geotagToleranceMinutes` | no | 2 | |
| `privacyZones` | no | | List of `{ lat, lon, radiusMeters }` |

The cache directory must never default to a location inside the notes folder, because the notes live in a synced Obsidian vault.

## 7. Timestamps

All timestamps are handled as absolute instants (luxon `DateTime` in UTC) internally. Display uses the trip timezone. `trip.json` stores ISO 8601 UTC strings plus precomputed local strings where the viewer needs them.

### 7.1 Photos

In order of priority:
1. EXIF `DateTimeOriginal` with `OffsetTimeOriginal` (plus `SubSecTimeOriginal` if present): an exact instant.
2. EXIF `DateTimeOriginal` without an offset: interpreted in the trip timezone.
3. `CreateDate`, using the same rules.
4. File name patterns (section 7.3).
5. File modification time, with a warning per file.

### 7.2 Videos

1. QuickTime `CreateDate` / `MediaCreateDate`. By the QuickTime spec these are UTC, and phones usually comply. If `videoTimesAreUtc` is false, interpret them in the trip timezone instead. `exiftool-vendored` may already apply an offset; check its behavior and make sure the result is correct.
2. If a timezone-aware tag is present (e.g. `CreationDate` with an offset), prefer it.
3. File name patterns, then modification time with a warning.

### 7.3 File name patterns

- `IMG_YYYYMMDD_HHMMSS`, `VID_YYYYMMDD_HHMMSS` and similar (`PANO_`, `MVIMG_`, with an optional suffix): local time, in the trip timezone.
- `PXL_YYYYMMDD_HHMMSSmmm` (Google Pixel): **UTC**.
- `YYYYMMDD_HHMMSS` (Samsung and others): local time.

### 7.4 Corrections and tracks

- `cameraOffsets` are applied after the timestamp is determined, to both photos and videos. Matching is by `"<Make> <Model>"` first, then by `"<Model>"`, both trimmed.
- FIT timestamps are UTC.

## 8. Processing pipeline

### 8.1 Discovery

- Scan the `media` and `tracks` entries. Folders are scanned recursively.
- Images: `.jpg .jpeg .png .webp`. Videos: `.mp4 .mov .m4v .3gp .mkv`. Tracks: `.fit`. Extensions are case-insensitive.
- Ignore hidden files, `.trashed-*` files, `Thumbs.db`, `.DS_Store`, and anything inside folders named `.thumbnails`.
- Unsupported files are listed once in the summary, not individually.

### 8.2 Cache

- Hash each file's content (SHA-256, streamed).
- The cache key is the content hash plus a hash of the settings that affect the output (e.g. image width and quality for images) plus a processing version constant in the code. Bump that constant whenever the processing logic changes.
- Cache metadata extraction results too (timestamps, GPS, dimensions), keyed by content hash.
- Identical files (same hash) are processed once and appear once in the trip, with a warning listing the duplicates.

### 8.3 Images

- Auto-rotate according to EXIF orientation (`sharp().rotate()`), then strip all metadata from the output (sharp's default).
- Output a thumbnail (width `thumbWidth`) and a display version (longest side `displayWidth`) as WebP at `quality`. Never upscale.
- Record the output dimensions and a dominant color (via `sharp().stats()`) as a placeholder background.

### 8.4 Videos

- Use `ffprobe` for duration, dimensions and rotation.
- Transcode to H.264 (`libx264`, `yuv420p`) with AAC audio, scaling so the shorter side is at most `maxShortSide` (never upscale, keep even dimensions). Use `crf`, `preset` and `audioBitrate` from the config, add `-movflags +faststart`, and strip metadata (`-map_metadata -1`).
- Make a poster frame at 1 s (or the first frame for shorter videos), saved as a WebP thumbnail and display image using the image settings.
- Run images in parallel (CPU count) and videos at most 2 at a time.

### 8.5 Output media

- Output files are content-addressed: `media/<hash12>-thumb.webp`, `media/<hash12>-display.webp`, `media/<hash12>.mp4`, `media/<hash12>-poster-thumb.webp`, `media/<hash12>-poster.webp`, where `<hash12>` is the first 12 hex characters of the content hash.
- Files are copied from the cache into `trips/<slug>/media/`. Afterwards, delete files in that folder that the current trip no longer references.

### 8.6 GPS from media

- Read `GPSLatitude` / `GPSLongitude` from photos and the equivalent QuickTime GPS tags from videos (exiftool exposes them as `GPSLatitude` / `GPSLongitude` or `GPSCoordinates`).
- Ignore `0,0` coordinates.

### 8.7 Tracks

- Parse each FIT file with `@garmin/fitsdk`. Use `record` messages for timestamp, position, altitude (`enhancedAltitude` if present) and distance. Use `session` messages for sport, total distance, timer time and total ascent/descent when available.
- FIT positions are in semicircles: degrees = semicircles × (180 / 2³¹). Skip records without a position.
- Each FIT file is one track. A track belongs to the day page that contains its start time (section 8.8). A day may have several tracks.
- Stats: distance (session total, falling back to a haversine sum), duration (first to last record), moving time (session timer time if available), ascent and descent (session values, falling back to computing from smoothed altitude), and minimum and maximum elevation.
- Points for display: simplify with Douglas–Peucker at `simplifyToleranceMeters`, keeping elevation and time offset for each remaining point.
- Elevation profile: `[distanceMeters, elevationMeters]` pairs, downsampled to at most 300 points.
- Geotagging: media without GPS whose timestamp lies within the track's time range (plus or minus `geotagToleranceMinutes`) gets a position interpolated linearly between the two nearest full-resolution track records. Mark it as `source: "track"`. Media with its own GPS keeps it as `source: "exif"`.
- The track lists the IDs of all media taken during its time range, for map pins.

### 8.8 Assigning media and tracks to days and entries

- **Day windows**: each note day D covers the interval from D 00:00 local time to D+1 00:00 local time. If the day has rolled-over entries (section 5.3), its window extends to just after its last entry, and the next day's window starts there.
- Media and tracks are assigned to the day whose window contains their timestamp.
- Media on dates with no note day get a **media-only day**: a day page with no entries, just the media. This also triggers the warning in section 5.4.
- **Within a day**: sort media by timestamp. Each media item goes under the last entry whose timestamp is less than or equal to its own. Media before the first entry goes in the day's `before` group.
- A track is placed as an item among the media of the entry it falls under, sorted by its start time.

### 8.9 Privacy

- All metadata is stripped from output files (sections 8.3 and 8.4).
- For each privacy zone: drop track points inside the zone (this naturally trims the start and end of tracks that begin near home), and remove the GPS position from media taken inside the zone (the media itself is still shown).
- Original file names are not written to the output.

## 9. Output

### 9.1 Site layout

```
site/
  index.html                 # copied from packages/viewer/dist
  assets/…                   # copied from packages/viewer/dist
  trips/
    index.json
    lissabon-2026/
      trip.json
      media/…
```

`build` copies the viewer's `dist` into the site root, overwriting `index.html` and `assets/` but nothing under `trips/`. If the viewer hasn't been built yet, fail with a message saying how to build it. Remove old `assets/` files that the new viewer build doesn't contain.

### 9.2 Data schema

Define these types in `packages/shared` and use them in both the generator and the viewer. All paths are relative to the trip folder. Bump `schemaVersion` on breaking changes.

```ts
export interface TripIndex {
  schemaVersion: 1;
  generatedAt: string;               // ISO UTC
  trips: TripSummary[];              // sorted by startDate, newest first
}

export interface TripSummary {
  slug: string;
  title: string;
  startDate: string;                 // "2026-10-23", local
  endDate: string;
  dayCount: number;
  photoCount: number;
  videoCount: number;
  cover?: { thumb: string; display: string; color?: string }; // paths relative to the site root
}

export interface Trip {
  schemaVersion: 1;
  generatedAt: string;
  slug: string;
  title: string;
  timezone: string;
  startDate: string;
  endDate: string;
  days: Day[];                       // sorted by date
  media: Record<string, Media>;
  tracks: Record<string, Track>;
}

export interface Day {
  date: string;                      // "2026-10-24", the heading's date
  hasNotes: boolean;                 // false for media-only days
  before: TimelineItem[];            // items before the first entry
  entries: Entry[];
  mapMediaIds: string[];             // all media of the day with a position
}

export interface Entry {
  id: string;
  time: string;                      // "13:30", as written
  timestamp: string;                 // ISO UTC
  text: string;
  items: TimelineItem[];             // sorted by time
}

export type TimelineItem =
  | { kind: "media"; id: string }
  | { kind: "track"; id: string };

export interface MediaBase {
  id: string;                        // hash12
  takenAt: string;                   // ISO UTC
  localTime: string;                 // "13:42", in the trip timezone
  width: number;                     // of the display version
  height: number;
  color?: string;                    // dominant color, "#rrggbb"
  gps?: { lat: number; lon: number; source: "exif" | "track" };
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

export interface Track {
  id: string;
  start: string;                     // ISO UTC
  end: string;
  localStart: string;                // "09:15"
  localEnd: string;
  sport?: string;
  stats: {
    distanceMeters: number;
    durationSeconds: number;
    movingSeconds?: number;
    ascentMeters?: number;
    descentMeters?: number;
    minElevation?: number;
    maxElevation?: number;
  };
  points: [lat: number, lon: number, ele: number | null, tOffsetSeconds: number][];
  elevationProfile: [distanceMeters: number, elevationMeters: number][];
  mediaIds: string[];
}
```

Write JSON without pretty-printing for `trip.json` (it can get large) and with pretty-printing for `index.json`.

## 10. Viewer

### 10.1 General

- Data is loaded with `fetch` from relative URLs (`./trips/index.json`, `./trips/<slug>/trip.json`). Show friendly German error messages for failed loads.
- Mobile-first and responsive. It should feel good on a phone, since that is where days will often be browsed.
- All UI strings live in one module (`strings.ts`). Dates are formatted in German with `Intl.DateTimeFormat("de-DE", { timeZone: trip.timezone })`, e.g. "Samstag, 24. Oktober 2026".
- Thumbnails use `loading="lazy"` and explicit `width`/`height` (or `aspect-ratio`) with the dominant color as background, so there's no layout shift.
- Maps are only initialized when they scroll into view (IntersectionObserver).
- Use `circleMarker`s or `divIcon`s in Leaflet rather than the default marker images, which break with bundlers. Import Leaflet's CSS. Always show OSM attribution.

### 10.2 Routes

| Route | Page |
|---|---|
| `#/` | Trip list |
| `#/:slug` | Day list of a trip |
| `#/:slug/:date` | Day timeline |
| `#/:slug/:date/:mediaId` | Day timeline with the lightbox open at that item (shareable deep link) |

### 10.3 Trip list

Cards with cover image, title, date range ("23.–30. Oktober 2026"), number of days, photos and videos. Newest trip first.

### 10.4 Day list

For each day: date and weekday, the first one or two entry texts as a preview, a small strip of thumbnails, counts, and an icon if the day has a track. Media-only days are visually marked as such. This is deliberately not a statistics overview.

### 10.5 Day timeline

- Header: date and weekday, a back link to the day list, and previous/next day navigation (buttons, plus left and right arrow keys when the lightbox is closed).
- If the day has geotagged media (`mapMediaIds`), show a collapsible day map (collapsed by default) with the media as pins.
- A vertical timeline: the `before` group first (if not empty), then each entry with its time and text, followed by its items.
- Media items appear as a grid of thumbnails that preserves aspect ratio reasonably (a simple justified-rows layout or a uniform grid with `object-fit: cover`; either is fine for v1). Videos show a play icon and their duration.
- Track items appear as a card with: start–end time, sport, the stats (distance in km, duration, ascent and descent), a Leaflet map with the route polyline (fit to bounds) and pins for the track's media (tapping a pin opens the lightbox), and the elevation profile as an SVG. Nice-to-have: hovering or touching the profile shows the corresponding position on the map.
- Media-only days show the media grid without entries and a short note that there are no notes for this day.

### 10.6 Lightbox

- Opens on tapping any thumbnail or map pin. Swipes and arrow keys move through **all media of the day** in chronological order.
- Videos play inline with controls (`yet-another-react-lightbox` video plugin) and use the poster.
- The caption shows the local time, plus the text of the entry the item belongs to.
- The URL updates to the deep link route (section 10.2) and closing returns to the day route, so the browser back button closes the lightbox.

## 11. Deployment (document in the README)

- Build: `npm run build -w viewer`, then `retrace build path/to/trip.config.json`.
- Copy to the Pi, e.g. `rsync -av --delete site/ pi@raspberrypi:/var/www/retrace/`. Also document a Windows alternative (e.g. `scp -r`, or WinSCP).
- Provide a minimal nginx server block and a Caddyfile. Set long cache headers (`immutable`) for `trips/*/media/` and `assets/`, since both are content-addressed, and `no-cache` for `index.html` and the JSON files.
- Mention that the Pi has 32 GB and how to check the size of a trip folder before copying (the build summary prints it).

## 12. Development and testing

- Unit tests (Vitest) for: the note parser and all validation rules, midnight rollover, weekday matching, timestamp resolution (each source in section 7, including `PXL_` as UTC and camera offsets), day windows and entry assignment, semicircle conversion, simplification, geotag interpolation, and privacy zones.
- `examples/` contains a small sample trip: a notes file exercising the format (including a rollover, a weekday, and a deliberately media-only date), and a script that **generates** test media rather than committing binaries: images made with `sharp`, EXIF timestamps and GPS written with `exiftool-vendored`, a few seconds of test video made with ffmpeg's `testsrc`, and a small FIT file written with the `@garmin/fitsdk` encoder. Generated files go to a git-ignored folder.
- Test the end-to-end `build` on the sample trip, and check that a second run hits the cache and changes nothing.

## 13. Milestones

Implement in this order and keep each milestone working and tested before moving on:

1. Monorepo scaffolding, shared types, tooling (TypeScript, ESLint, Prettier, Vitest).
2. Config loading and the note parser with full validation; the `check` command.
3. Media discovery, metadata extraction and timestamp resolution, including the media-related warnings in `check`.
4. Media processing with the cache; day and entry assignment; writing `trip.json` and `index.json`; the `build` and `index` commands.
5. Viewer: trip list, day list, day timeline, lightbox with deep links.
6. FIT tracks: parsing, stats, simplification, geotagging, privacy zones; track cards and the day map in the viewer.
7. The `preview` command; README with setup (including installing ffmpeg on Windows and macOS) and deployment.

## 14. Future ideas (not v1)

Curation via a sidecar file next to the trip config (hide, favorite, caption); a "replay" slider that scrubs through a day with a moving map marker; multiple timezones per trip; GPX import; moving to a real server later (e.g. Immich), which the content-addressed layout should make easy.
