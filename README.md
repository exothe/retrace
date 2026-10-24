# Retrace

Turns a vacation's notes, photos, videos and GPS tracks into a static website for
re-experiencing each day of the trip. See [SPEC.md](SPEC.md) for the full specification.

## Repository layout

```
packages/
  shared/      TypeScript types for trip.json / index.json (no runtime code)
  generator/   the `retrace` CLI
  viewer/      React app that displays generated trips
examples/      sample trip for development and tests
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

```sh
retrace check path/to/trip.config.json [--strict] [--verbose]
```

Validates the trip config (JSON, see SPEC section 6) and the `# Verlauf` section of the notes and prints a report
(`<file>:<line>: error|warning: <message>`). Exit code 0 on success, 1 on validation errors
(or warnings with `--strict`), 2 on runtime failures.

Setup, usage and deployment docs will be completed in milestone 7.
