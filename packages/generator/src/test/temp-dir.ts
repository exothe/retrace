import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";

/**
 * Creates a temporary directory per test, removed afterwards. Returns a helper that writes
 * files into it (creating parent folders) and returns their absolute path.
 */
export function useTempDir() {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });
  return async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "retrace-test-"));
    dirs.push(dir);
    const write = async (relative: string, content = "") => {
      const file = path.join(dir, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
      return file;
    };
    const folder = async (relative: string) => {
      const p = path.join(dir, relative);
      await mkdir(p, { recursive: true });
      return p;
    };
    return { dir, write, folder };
  };
}
