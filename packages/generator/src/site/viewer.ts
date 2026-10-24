import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { TRIPS_DIR } from "./trip-folder.ts";

/** The viewer build in this repository: packages/viewer/dist. */
export const DEFAULT_VIEWER_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "viewer",
  "dist",
);

export class ViewerMissingError extends Error {
  constructor(dir: string) {
    super(
      `The viewer hasn't been built yet (${dir} is missing). Build it with: npm run build -w viewer`,
    );
    this.name = "ViewerMissingError";
  }
}

export async function assertViewerBuilt(viewerDir: string): Promise<void> {
  const index = await stat(path.join(viewerDir, "index.html")).catch(() => undefined);
  if (!index?.isFile()) throw new ViewerMissingError(viewerDir);
}

/**
 * Copies the viewer build into the site root (SPEC section 9.1): overwrites index.html,
 * assets/ and other top-level files, never touches trips/, and removes old files from assets/
 * that the new build doesn't contain. Unchanged files are not rewritten.
 */
export async function copyViewer(
  viewerDir: string,
  siteDir: string,
): Promise<{ copied: number; removed: number }> {
  await assertViewerBuilt(viewerDir);
  let copied = 0;
  const files = await listFiles(viewerDir);
  for (const relative of files) {
    if (relative.split(path.sep)[0] === TRIPS_DIR) continue;
    const source = path.join(viewerDir, relative);
    const target = path.join(siteDir, relative);
    if (await sameContent(source, target)) continue;
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    copied++;
  }

  let removed = 0;
  const assets = new Set(files.filter((f) => f.split(path.sep)[0] === "assets"));
  for (const relative of await listFiles(path.join(siteDir, "assets"))) {
    if (!assets.has(path.join("assets", relative))) {
      await rm(path.join(siteDir, "assets", relative), { force: true });
      removed++;
    }
  }
  return { copied, removed };
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)));
}

async function sameContent(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([stat(a), stat(b).catch(() => undefined)]);
  if (!y || x.size !== y.size) return false;
  const [bufA, bufB] = await Promise.all([readFile(a), readFile(b)]);
  return bufA.equals(bufB);
}
