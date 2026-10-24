# Retrace

Turns a vacation's notes, photos, videos and GPS tracks into a static website for
re-experiencing each day of the trip: step through a day entry by entry, with the photos and
videos taken in between and the GPS tracks of hikes on a map. The site is plain static files,
built once on your computer and copied to a web server such as a Raspberry Pi.

See [SPEC.md](SPEC.md) for the full specification.

- [Setup](#setup)
- [Making a trip](#making-a-trip)
- [Commands](#commands)
- [Deployment](#deployment)
- [Development](#development)

## Setup

You need **Node.js 22.12 or newer** and **ffmpeg** (with `ffprobe`). Retrace runs on macOS and
Windows (and Linux).

### Install ffmpeg

**macOS** with [Homebrew](https://brew.sh):

```sh
brew install ffmpeg
```

**Windows**, with winget (built into Windows 10 and 11), then open a new terminal:

```powershell
winget install Gyan.FFmpeg
```

Or download a build from https://www.gyan.dev/ffmpeg/builds/ (the "essentials" zip is enough),
unpack it, and either add its `bin` folder to `PATH` or point the trip config at it:

```json
"ffmpegPath": "C:/Tools/ffmpeg/bin/ffmpeg.exe",
"ffprobePath": "C:/Tools/ffmpeg/bin/ffprobe.exe"
```

**Linux**: `sudo apt install ffmpeg` (or your distribution's equivalent).

Check it with `ffmpeg -version`. `retrace build` checks it too and prints these hints if
ffmpeg is missing. exiftool is bundled, so nothing else needs to be installed.

Videos are encoded as AV1, so ffmpeg needs the SVT-AV1 encoder: `ffmpeg -encoders` must list
`libsvtav1`. The Homebrew and gyan.dev builds include it, as do the packages of current Linux
distributions (e.g. Debian 12, Ubuntu 24.04). AV1 plays in current Chrome, Edge and Firefox, but
in Safari only on devices with AV1 hardware decoding (iPhone 15 Pro, M3 Macs and newer).

For JPEG XL photos (`.jxl`), Retrace also needs `djxl` from libjxl: `brew install jpeg-xl` on
macOS, `sudo apt install libjxl-tools` on Linux, or on Windows `djxl.exe` from
`jxl-x64-windows-static.zip` at https://github.com/libjxl/libjxl/releases, set as `"djxlPath"`
in the trip config. Trips without JPEG XL photos don't need it.

### Install Retrace

```sh
git clone <this repository> retrace
cd retrace
npm install
npm run build              # builds the viewer and the generator
npm link -w generator      # makes the `retrace` command available everywhere
```

`npm link` links to this checkout, so after pulling changes `npm run build` is enough. To
remove the command again: `npm unlink -g generator`.

## Making a trip

### Notes

Write the trip in Obsidian (or any editor) as one Markdown file. Retrace reads only the
`# Verlauf` section; everything else in the file is ignored:

```markdown
# Verlauf

## 23.10.2026 (Freitag)

- [08:00] Aufgewacht
- [09:10] Raus in die Stadt
- [13:30] Super Mittagessen

## 24.10.2026

- [07:45] Früh los zur Wanderung
- [23:40] Noch eine Bar gefunden
- [00:30] Zurück im Hotel
```

An entry after midnight (like `[00:30]` above) stays on the day it was written under. See SPEC
section 5 for the exact rules; `retrace check` reports every problem with file and line.

### Trip config

One JSON file per trip, e.g. `Lissabon 2026.config.json` next to the photos. Relative paths
are resolved from the config file's folder:

```json
{
  "title": "Lissabon 2026",
  "slug": "lissabon-2026",
  "timezone": "Europe/Lisbon",
  "notes": "../Obsidian/Urlaub/Lissabon 2026.md",
  "media": ["./Fotos", "./Videos"],
  "tracks": ["./Tracks"],
  "output": "../site",
  "cover": "IMG_20261023_091512.jpg",
  "cameraOffsets": { "Canon EOS R6": "-00:02:30" }
}
```

- `title`, `slug` (`a-z`, `0-9`, `-`; used in URLs), `timezone`, `notes`, `media` and `output`
  are required.
- `output` is the site directory. All trips can share one: each trip goes into
  `trips/<slug>/`, and the trip list shows all of them.
- `tracks` are FIT files from a GPS watch or bike computer (optional).
- `cameraOffsets` corrects a camera whose clock was off; the value is added to its timestamps.
- Image and video quality, track simplification and the cache folder can be set too; see SPEC
  section 6 for all keys and their defaults.

The cache lives in your OS cache folder by default (on macOS `~/Library/Caches/retrace`, on
Windows `%LOCALAPPDATA%\retrace\Cache`), never in the synced notes folder.

### Build and check

```sh
retrace check "Lissabon 2026.config.json"     # validate notes and media, writes nothing
retrace build "Lissabon 2026.config.json"     # process media and write the site
retrace preview ../site                       # look at it on http://localhost:4173
```

The first build converts every photo and video and can take a while; later builds only process
what changed. The build summary ends with the trip folder's size, e.g.
`Built lissabon-2026: 8 days, 54 entries, 412 photos, 23 videos, 3 tracks, 0 warnings, 1.2 GB in ../site/trips/lissabon-2026`.

To look at the site on your phone before deploying, run `retrace preview ../site --host` and
open one of the printed network addresses on a phone in the same Wi-Fi.

To try everything without your own photos, use the sample trip in
[examples/README.md](examples/README.md).

## Commands

```sh
retrace check <config.json> [--strict] [--verbose] [--no-cache]
retrace build <config.json> [--strict] [--verbose] [--no-cache]
retrace index <siteDir> [--strict]
retrace preview [siteDir] [--port <port>] [--host [host]]
```

- `check` validates the config and the notes, reads the metadata of all photos, videos and
  tracks, and prints a report (`<file>:<line>: error|warning: <message>`), including hints such
  as photos on a date without a day heading. It writes nothing except the metadata cache.
  `--verbose` lists every file with its resolved local time and where that time came from.
- `build` runs the same checks and stops on errors (and on warnings with `--strict`). Then it
  processes photos and videos (cached), writes `trips/<slug>/` into the site directory, copies
  the viewer and rebuilds `trips/index.json`. A rebuild without changes rewrites nothing.
- `index` rebuilds `trips/index.json` from all `trips/*/trip.json`, e.g. after deleting a trip
  folder by hand.
- `preview` serves a site directory (default: the current folder) on port 4173. `--host` makes
  it reachable from other devices in the network; without it, only from this computer.

`--no-cache` reprocesses everything. Exit codes: 0 on success, 1 on validation errors (or
warnings with `--strict`), 2 on runtime failures such as a missing ffmpeg.

## Deployment

The site directory is all there is: `index.html`, `assets/` and `trips/`. Any static web server
works, under any path, with no special configuration. These instructions use a Raspberry Pi
with nginx or Caddy serving `/var/www/retrace`.

### Check the size first

The Pi has 32 GB. Each build prints the size of the trip folder; to check the whole site:

```sh
du -sh site site/trips/*                                         # macOS and Linux
```

```powershell
"{0:N0} MB" -f ((Get-ChildItem -Recurse site | Measure-Object Length -Sum).Sum / 1MB)  # Windows
```

and the free space on the Pi with `ssh pi@raspberrypi df -h /var/www`. If a trip is too big,
lower `images.quality`, `videos.crf` (higher is smaller) or `videos.maxShortSide` in its config
and rebuild.

### Copy to the Pi

**macOS and Linux** with rsync, which only copies changed files:

```sh
rsync -av --delete site/ pi@raspberrypi:/var/www/retrace/
```

The trailing `/` on `site/` matters. `--delete` removes files on the Pi that are no longer in
the local site (old media, old viewer assets), so the local site directory is the master copy:
keep all trips in it.

**Windows**: the built-in OpenSSH client can copy everything (it can't delete old files, and
it copies unchanged files again):

```powershell
scp -r site\* pi@raspberrypi:/var/www/retrace/
```

For incremental updates use [WinSCP](https://winscp.net): connect to the Pi, then
_Commands → Synchronize_, with the local `site` folder as source, `/var/www/retrace` as
target, direction "Remote", and "Delete files" checked.

On the Pi, the web server must be able to read the files, e.g.
`sudo chown -R pi:www-data /var/www/retrace && sudo chmod -R g+rX /var/www/retrace`.

### Web server configuration

Media files and viewer assets have content-derived names and never change, so browsers can
cache them forever. `index.html` and the JSON files change with every build and must be
revalidated.

**nginx** (`/etc/nginx/sites-available/retrace`, then link it into `sites-enabled` and run
`sudo systemctl reload nginx`):

```nginx
server {
    listen 80;
    server_name raspberrypi.local;
    root /var/www/retrace;
    index index.html;

    gzip on;
    gzip_types application/json text/css application/javascript;

    # Content-addressed: cache forever.
    location ~ ^/(assets|trips/[^/]+/media)/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # index.html and the JSON files: always revalidate.
    location / {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ =404;
    }
}
```

**Caddy** (`/etc/caddy/Caddyfile`, then `sudo systemctl reload caddy`):

```caddyfile
:80 {
	root * /var/www/retrace
	encode zstd gzip
	file_server

	# Content-addressed: cache forever.
	@immutable path_regexp ^/(assets|trips/[^/]+/media)/
	header @immutable Cache-Control "public, max-age=31536000, immutable"

	# index.html and the JSON files: always revalidate.
	@fresh not path_regexp ^/(assets|trips/[^/]+/media)/
	header @fresh Cache-Control "no-cache"
}
```

Both servers support range requests for static files out of the box, which video seeking needs.

Images are AVIF files and must be served as `image/avif`. Caddy does this by default. Older
nginx versions lack the type: if `curl -I http://raspberrypi.local/trips/<trip>/media/<file>.avif`
shows `application/octet-stream`, add `image/avif avif;` to `/etc/nginx/mime.types`.

To serve the site under a sub-path instead (e.g. `http://raspberrypi/retrace/`), copy it into
that folder and adjust the paths in the regex; the site itself needs no changes.

Media file names are derived from the original file's content, not from the quality settings.
If you change `images` or `videos` settings and rebuild, browsers that already cached a file
keep their old copy. A hard reload on that device fetches the new files.

## Development

```sh
npm install
npm run typecheck      # tsc in every workspace
npm run lint           # ESLint
npm run format:check   # Prettier
npm test               # Vitest (all packages)
npm run build          # build viewer and generator
```

```
packages/
  shared/      TypeScript types for trip.json / index.json (no runtime code)
  generator/   the `retrace` CLI
  viewer/      React app that displays generated trips
examples/      sample trip and test media generator
```

Run the CLI from source without building (Node strips the TypeScript types):

```sh
npm run dev -w generator -- check examples/lissabon-2026/trip.config.json --verbose
```

The viewer has a Vite dev server with hot reload. It serves `trips/` from `examples/site`
(build the sample trip first), or from the site directory in `RETRACE_SITE`:

```sh
npm run dev -w viewer
RETRACE_SITE=/path/to/site npm run dev -w viewer
```
