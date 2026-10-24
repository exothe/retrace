# CLAUDE.md

Retrace turns trip notes (Obsidian Markdown), photos, videos and FIT tracks into a static site.
SPEC.md is the source of truth for behavior; README.md covers usage and deployment. Keep SPEC.md
in sync when behavior or config keys change.

## Layout

npm workspaces: `packages/shared` (types for trip.json/index.json, type-only, no runtime code),
`packages/generator` (the `retrace` CLI), `packages/viewer` (React app), `examples` (sample trip
and a script that generates its media).

## Commands

```sh
npm test                        # Vitest, all workspaces (root vitest.config.ts has the projects)
npx vitest run --project generator src/config.test.ts   # one project / file
npm run typecheck && npm run lint && npm run format:check
npm run build                   # viewer, then generator
npm run dev -w generator -- check examples/lissabon-2026/trip.config.json --verbose
npm run examples:generate       # sample media into examples/generated/ (needs ffmpeg)
npm run dev -w viewer           # serves trips/ from examples/site or $RETRACE_SITE
```

Run Prettier on files you touch (`npx prettier --write <paths>`); it rewraps lines, so read a
file again before an exact-match edit.

## TypeScript conventions

- TypeScript 6.0, not 7: typescript-eslint doesn't support 7 yet.
- Relative imports use `.ts`/`.tsx` extensions (`rewriteRelativeImportExtensions`), so Node runs
  the generator source directly. `erasableSyntaxOnly` is on: no enums, no parameter properties,
  no namespaces. Use `as const` objects instead of enums (see `exit-codes.ts`).
- `noUncheckedIndexedAccess` is on; `!` for known-present indices and regex groups is fine
  (the lint rule against it is off on purpose).
- `import type` for type-only imports (lint enforces it). Import shared types from
  `@retrace/shared`.
- Code, comments, docs and CLI output in English; viewer UI text in German, only in
  `packages/viewer/src/strings.ts`.
- Cross-platform (Windows and macOS): `node:path` only, no shell, spawn without a shell, handle
  CRLF and BOMs, compare file names in NFC.

## Generator

- Problems are `Diagnostic`s (`diagnostics.ts`), printed as `<file>:<line>: error|warning: …`.
  Errors stop `build`; warnings fail only with `--strict`. A file that can't be processed is a
  warning and is skipped, not a crash. Exit codes: 0 ok, 1 validation, 2 runtime.
- `parseNotes` is a pure function; keep it that way. `validate.ts` is shared by `check` and
  `build`.
- Config is strict JSON parsed with `jsonc-parser` for line numbers (keep it; it was a deliberate
  choice), validated with zod `strictObject`, so unknown keys are errors. A new key needs the
  schema, `TripConfig`, `resolveConfig`, tests, and the table in SPEC section 6.
- Timestamps: luxon, UTC internally. Metadata comes from exiftool-vendored's `readRaw` with an
  explicit tag list, never `read()`: `read()` infers timezones on its own, which breaks the SPEC
  rules (dates without offset are in the trip timezone; QuickTime dates are UTC).
- Cache (`cache.ts`, `process/`): keyed by content hash + settings hash + a version constant.
  Bump `METADATA_VERSION`, `IMAGE_VERSION`, `VIDEO_VERSION` or `POSTER_VERSION` when the
  corresponding processing changes.
- A rebuild without changes must change nothing on disk: `writeJsonIfChanged` ignores
  `generatedAt`, media copies compare size + mtime, viewer files compare content. The end-to-end
  test checks this.
- Bump `schemaVersion` (shared types and viewer `SUPPORTED_SCHEMA`) on breaking changes to
  trip.json.
- Privacy zones were removed on purpose; don't re-add them.

## Viewer

- HashRouter and relative URLs only (`./trips/…`), so the site works under any base path.
- Tailwind v4 via `@tailwindcss/vite`; dark mode is the default `dark:` variant
  (prefers-color-scheme). No external requests except OSM tiles.
- Leaflet is lazy-loaded (`MapView` → `RouteMap` chunk) and only mounts when scrolled into view.
  leaflet.css is unlayered, so styles that must beat it (the thumbnail pins in `global.css`)
  are unlayered too and scoped under Leaflet's classes.
- Effects must not return values unintentionally: `useEffect(() => window.scrollTo(0, 0))`
  crashed in real browsers, because scroll methods return a Promise there. Use braces.
- Entry text is plain text; never render it as HTML.

## Tests

- Generator helpers in `src/test/`: `useTempDir()`, `writePhoto()` (sharp + exiftool),
  `encodeFit()` (Garmin encoder). Tests needing ffmpeg use `it.runIf(hasFfmpeg)`.
- `commands/build.test.ts` builds the full sample trip twice (generates the media first).
- Viewer tests run in jsdom (`src/test/setup.ts`): scroll methods return Promises like real
  browsers, and IntersectionObserver never fires until a test calls `intersectAll()`. Tests mock
  `components/RouteMap.tsx` because Leaflet can't render in jsdom. The lightbox ignores input and
  reports slide changes only after its animations, so tests wait (`animations()`) around key
  presses.
- The sample trip's expected `check` result is 0 errors and 3 warnings (media-only date,
  duplicate, file without timestamp). Update examples/README.md if that changes.

## Working with the user

- Check the current version of a package (`npm view`) and its peer dependencies before adding
  it, and pin exact versions.
- For larger changes, stop after each step so the user can review.
- When verifying viewer changes, rebuild the viewer and the sample site
  (`npm run build -w viewer`, then `retrace build examples/lissabon-2026/trip.config.json`) and
  check them in a browser if one is available; jsdom tests don't catch layout or CSS problems.
