import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Bump when metadata extraction changes (tags read, how they are stored), so cached results
 * are re-extracted. Processing versions for images and videos live next to their code.
 */
export const METADATA_VERSION = 2;

/** SHA-256 of a file's content, streamed. */
export async function hashFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/** Short hash of settings that affect an output, for cache keys. */
export function settingsHash(settings: unknown): string {
  return createHash("sha256").update(JSON.stringify(settings)).digest("hex").slice(0, 16);
}

interface HashEntry {
  size: number;
  mtimeMs: number;
  hash: string;
}

/**
 * The on-disk cache (SPEC section 8.2). With `enabled: false` (`--no-cache`) nothing is read,
 * but fresh results are still written so the next run can use them.
 */
export class Cache {
  readonly dir: string;
  readonly enabled: boolean;
  #hashes = new Map<string, HashEntry>();
  #hashesDirty = false;

  private constructor(dir: string, enabled: boolean) {
    this.dir = dir;
    this.enabled = enabled;
  }

  static async open(dir: string, { enabled = true } = {}): Promise<Cache> {
    const cache = new Cache(dir, enabled);
    if (enabled) {
      const stored = await readJson<Record<string, HashEntry>>(cache.#hashesFile);
      if (stored) cache.#hashes = new Map(Object.entries(stored));
    }
    return cache;
  }

  get #hashesFile() {
    return path.join(this.dir, "file-hashes.json");
  }

  /**
   * Content hash of a file. Re-hashing every file on every run is slow for videos, so hashes
   * are remembered by path, size and modification time; any change re-hashes the file.
   */
  async hash(file: string, info: { size: number; mtimeMs: number }): Promise<string> {
    const key = file.normalize("NFC");
    const known = this.#hashes.get(key);
    if (this.enabled && known && known.size === info.size && known.mtimeMs === info.mtimeMs) {
      return known.hash;
    }
    const hash = await hashFile(file);
    this.#hashes.set(key, { size: info.size, mtimeMs: info.mtimeMs, hash });
    this.#hashesDirty = true;
    return hash;
  }

  async readMetadata<T>(hash: string): Promise<T | undefined> {
    if (!this.enabled) return undefined;
    const stored = await readJson<{ version: number; metadata: T }>(this.#metadataFile(hash));
    return stored?.version === METADATA_VERSION ? stored.metadata : undefined;
  }

  async writeMetadata(hash: string, metadata: unknown): Promise<void> {
    await writeJsonAtomic(this.#metadataFile(hash), { version: METADATA_VERSION, metadata });
  }

  #metadataFile(hash: string) {
    return path.join(this.dir, "metadata", hash.slice(0, 2), `${hash}.json`);
  }

  /** Persists remembered file hashes. */
  async save(): Promise<void> {
    if (!this.#hashesDirty) return;
    await writeJsonAtomic(this.#hashesFile, Object.fromEntries(this.#hashes));
    this.#hashesDirty = false;
  }
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return undefined; // missing or corrupt: treat as a cache miss
  }
}

/** Writes via a temporary file and rename, so an interrupted run never leaves a partial file. */
async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value));
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
