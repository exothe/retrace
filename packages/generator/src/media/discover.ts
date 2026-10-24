import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

export type MediaKind = "photo" | "video";

export interface DiscoveredMedia {
  /** Absolute path as returned by the file system */
  path: string;
  kind: MediaKind;
}

export interface Discovery {
  /** Sorted by path */
  media: DiscoveredMedia[];
  /** FIT files, sorted by path */
  tracks: string[];
  /** Files with an unsupported extension, sorted by path */
  unsupported: string[];
}

const PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".jxl"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".3gp", ".mkv"]);
const TRACK_EXTENSIONS = new Set([".fit"]);
const IGNORED_NAMES = new Set(["thumbs.db", "desktop.ini"]);

/** Whether a file or folder is skipped entirely (SPEC section 8.1). */
export function isIgnored(name: string): boolean {
  // Covers hidden files and folders, .DS_Store, .trashed-* and .thumbnails.
  return name.startsWith(".") || IGNORED_NAMES.has(name.toLowerCase());
}

export function classify(file: string): MediaKind | "track" | undefined {
  const ext = path.extname(file).toLowerCase();
  if (PHOTO_EXTENSIONS.has(ext)) return "photo";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (TRACK_EXTENSIONS.has(ext)) return "track";
  return undefined;
}

/**
 * Scans the configured media and track entries. Folders are scanned recursively; files are
 * classified by extension wherever they are listed, so a FIT file in a media folder is still a
 * track. Files listed explicitly are taken even if their name would be ignored in a folder scan.
 */
export async function discover(entries: readonly string[]): Promise<Discovery> {
  const files = new Set<string>();
  const visitedDirs = new Set<string>();

  const walk = async (dir: string) => {
    const real = await realpath(dir);
    if (visitedDirs.has(real)) return; // symlink loop or folder listed twice
    visitedDirs.add(real);
    const dirents = await readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
      if (isIgnored(dirent.name)) continue;
      const full = path.join(dir, dirent.name);
      let isDir = dirent.isDirectory();
      let isFile = dirent.isFile();
      if (dirent.isSymbolicLink()) {
        const target = await stat(full).catch(() => undefined);
        isDir = target?.isDirectory() ?? false;
        isFile = target?.isFile() ?? false;
      }
      if (isDir) await walk(full);
      else if (isFile) files.add(full);
    }
  };

  for (const entry of entries) {
    const info = await stat(entry);
    if (info.isDirectory()) await walk(entry);
    else files.add(path.resolve(entry));
  }

  const result: Discovery = { media: [], tracks: [], unsupported: [] };
  for (const file of [...files].sort(comparePaths)) {
    const kind = classify(file);
    if (kind === "track") result.tracks.push(file);
    else if (kind) result.media.push({ path: file, kind });
    else result.unsupported.push(file);
  }
  return result;
}

/** Compares paths by their NFC form, so NFD names from macOS sort like typed names. */
export function comparePaths(a: string, b: string): number {
  const x = a.normalize("NFC");
  const y = b.normalize("NFC");
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Summarizes unsupported files by extension, e.g. ".heic ×3, .txt ×1". */
export function summarizeUnsupported(files: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const file of files) {
    const ext = path.extname(file).toLowerCase() || "(no extension)";
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([ext, count]) => `${ext} ×${count}`)
    .join(", ");
}
