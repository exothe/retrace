# Sample trip

A small sample trip for development and tests (SPEC section 12):

- `lissabon-2026/Lissabon 2026.md`: notes with a weekday, a midnight rollover and a DST switch
- `lissabon-2026/trip.config.json`: the trip config, including a camera offset
- `scripts/generate-media.ts`: generates the test media into `generated/` (git-ignored)

The generated media covers each timestamp source (EXIF with and without offset, CreateDate,
`IMG_`/`PXL_`/Samsung file names, QuickTime dates, Apple CreationDate, modification time), a
media-only date (22.10.), a duplicate, ignored and unsupported files, and an NFD file name.
Each file's purpose is described in the script.

```sh
npm run examples:generate                                  # needs ffmpeg on PATH
npm run dev -w generator -- check examples/lissabon-2026/trip.config.json --verbose
```

The expected `check` result is 0 errors and 3 warnings (media-only date, duplicate, file
without timestamp).
