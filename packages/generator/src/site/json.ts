import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Writes via a temporary file and rename, so readers never see a partial file. */
export async function writeFileAtomic(file: string, content: string | Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, content);
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export async function readJsonFile<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/**
 * Writes `value` as JSON unless the file already holds the same data apart from `generatedAt`.
 * Then the file is left untouched (keeping its old `generatedAt`), so a rebuild without changes
 * changes nothing on disk. Returns whether the file was written.
 */
export async function writeJsonIfChanged<T extends { generatedAt: string }>(
  file: string,
  value: T,
  { pretty }: { pretty: boolean },
): Promise<boolean> {
  const existing = await readJsonFile<T>(file);
  const comparable = (v: T) => JSON.stringify({ ...v, generatedAt: "" });
  if (existing && comparable(existing) === comparable(value)) return false;
  await writeFileAtomic(
    file,
    (pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)) + "\n",
  );
  return true;
}
