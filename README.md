# Retrace

Turns a vacation's notes, photos, videos and GPS tracks into a static website for
re-experiencing each day of the trip. See [SPEC.md](SPEC.md) for the full specification.

## Repository layout

```
packages/
  shared/      TypeScript types for trip.json / index.json (no runtime code)
  generator/   the `retrace` CLI
  viewer/      React app that displays generated trips
examples/      sample trip and test media generator
```

## Development

Requires Node.js 22.12 or newer.

```sh
npm install
npm run typecheck      # tsc in every workspace
npm run lint           # ESLint
npm run format:check   # Prettier
npm test               # Vitest (all packages)
npm run build          # build viewer and generator
```

Run the CLI from source without building (Node strips the TypeScript types):

```sh
npm run dev -w generator -- --help
```

## Usage

Install the `retrace` command once (it links to this checkout, so later changes only need
`npm run build -w generator`):

```sh
npm run build              # viewer and generator
npm link -w generator
```

Or run from source without building: `npm run dev -w generator -- <command> …`.

```sh
retrace check path/to/trip.config.json [--strict] [--verbose] [--no-cache]
retrace build path/to/trip.config.json [--strict] [--verbose] [--no-cache]
retrace index path/to/site [--strict]
```

- `check` validates the trip config (JSON, see SPEC section 6) and the `# Verlauf` section of
  the notes, reads the metadata of all photos and videos, and prints a report
  (`<file>:<line>: error|warning: <message>`). It writes nothing except the metadata cache.
  `--verbose` lists every file with its resolved local time and timestamp source.
- `build` does the same checks, stops on errors (and on warnings with `--strict`), then
  processes photos and videos (cached), writes `trips/<slug>/` into the site directory, copies
  the viewer and rebuilds `trips/index.json`. It needs `ffmpeg` and `ffprobe` and a built viewer
  (`npm run build -w viewer`). A rebuild without changes rewrites nothing.
- `index` rebuilds `trips/index.json` from all `trips/*/trip.json`.

Exit codes: 0 on success, 1 on validation errors (or warnings with `--strict`), 2 on runtime
failures such as a missing ffmpeg.

Try it on the sample trip, see [examples/README.md](examples/README.md).

## Viewer development

```sh
npm run dev -w viewer      # Vite dev server with hot reload
```

The dev server serves `trips/` from `examples/site` (build the sample trip first, see
[examples/README.md](examples/README.md)), or from another site directory set in
`RETRACE_SITE=/path/to/site`.

Setup, usage and deployment docs will be completed in milestone 7.
