// ── File-backed snapshot store ───────────────────────────────────────
// Reusable Bun-native primitive for persisting / retrieving small
// gzipped JSON blobs by short identifier. Standalone — currently NOT
// wired into any cache module. Intended for future use if/when the
// server-side caches need on-disk persistence (e.g. when the app moves
// to a host with a real filesystem like Oracle Cloud's ARM VM, where
// writes survive process restarts).
//
// ── Security model ────────────────────────────────────────────────
//
// 1. **Path traversal (OWASP A01):** `source` is validated against
//    `SOURCE_RE` before any filesystem access — strict allowlist of
//    lowercase ASCII + digits + hyphen, anchored, length-capped.
//    Because the pattern bans `/`, `\`, `.` and `\0`, the resulting
//    path cannot escape the configured directory.
//
// 2. **Decompression bomb (OWASP A05):** the gzipped read is capped at
//    `maxGzipBytes` on disk; the decompressed buffer is capped at
//    `maxSnapshotBytes`. Either limit being exceeded returns null —
//    the caller treats this identically to "no snapshot."
//
// 3. **JSON parse safety:** parsed objects are returned as `unknown`.
//    Callers MUST shape-validate via their own normalize* helpers
//    before ingesting — a malformed snapshot fails closed.
//
// 4. **Atomic writes:** `Bun.write` is used directly (writes to a temp
//    file and renames on success), so a crashed flush never publishes
//    a partial file. Writes are best-effort: errors are logged, not
//    thrown, so a transient disk issue can't crash the caller.
//
// 5. **Empty / missing:** missing files return null, never throw.
//    Invalid source names return null after a single warn log.

/** Strict allowlist for snapshot identifiers. Anchored, lowercase
 *  letters + digits + hyphen only, must start with a letter, length
 *  1–32. Identical character class to the existing fixture label
 *  pattern used by aircraftCache.ts so the two stay aligned. */
const SOURCE_RE = /^[a-z][a-z0-9-]{0,31}$/;

/** Decompressed size hard cap. 100 MB leaves 20× headroom over any
 *  realistic single-source snapshot (largest expected is the aircraft
 *  body at ~5 MB uncompressed). */
export const DEFAULT_MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;

/** On-disk size hard cap on the gzipped file before decompression. */
export const DEFAULT_MAX_GZIP_BYTES = 25 * 1024 * 1024;

/** Default snapshot directory, computed relative to this module so it
 *  resolves correctly both in dev and in any container image that
 *  copies `src/server/` verbatim. */
export const DEFAULT_SNAPSHOT_DIR = `${import.meta.dir}/../data/snapshots`;

export type SnapshotStore = {
  load<T>(source: string): Promise<T | null>;
  save<T>(source: string, body: T): Promise<void>;
};

export type FileSnapshotStoreConfig = {
  /** Path to the directory holding `<source>.json.gz` files. */
  dir?: string;
  /** Max on-disk size of the gzipped file. Default 25 MB. */
  maxGzipBytes?: number;
  /** Max size of the decompressed buffer. Default 100 MB. */
  maxSnapshotBytes?: number;
};

/** Validate the source name and build the on-disk path. Throws on
 *  invalid input. Exposed for tests; production callers go through
 *  load/save which catch the throw and degrade to null. */
export function snapshotPath(dir: string, source: string): string {
  if (!SOURCE_RE.test(source)) {
    throw new Error(`Invalid snapshot source: ${JSON.stringify(source)}`);
  }
  // The regex restricts `source` to `[a-z0-9-]` so there is no way for
  // it to introduce a `/`, `\`, `..`, or null byte. Plain string concat
  // is safe and avoids dragging in node:path.
  return `${dir}/${source}.json.gz`;
}

/** Build a file-backed snapshot store. Pure factory — no module-level
 *  state. Tests use this with a tmpdir + small size caps; production
 *  callers use `fileSnapshotStore` below. */
export function createFileSnapshotStore(
  config: FileSnapshotStoreConfig = {},
): SnapshotStore {
  const dir = config.dir ?? DEFAULT_SNAPSHOT_DIR;
  const maxGzip = config.maxGzipBytes ?? DEFAULT_MAX_GZIP_BYTES;
  const maxSnapshot = config.maxSnapshotBytes ?? DEFAULT_MAX_SNAPSHOT_BYTES;

  return {
    async load<T>(source: string): Promise<T | null> {
      let path: string;
      try {
        path = snapshotPath(dir, source);
      } catch (err) {
        console.warn(
          `📦 snapshot: rejected source "${source}": ${
            err instanceof Error ? err.message : "validation error"
          }`,
        );
        return null;
      }

      const file = Bun.file(path);
      if (!(await file.exists())) return null;

      const size = file.size;
      if (size === 0) return null;
      if (size > maxGzip) {
        console.warn(
          `📦 snapshot "${source}": file ${size} B exceeds ${maxGzip} B cap — ignoring`,
        );
        return null;
      }

      try {
        const gzipped = new Uint8Array(await file.arrayBuffer());
        const decompressed = Bun.gunzipSync(gzipped);
        if (decompressed.byteLength > maxSnapshot) {
          console.warn(
            `📦 snapshot "${source}": decompressed ${decompressed.byteLength} B exceeds ${maxSnapshot} B cap — ignoring`,
          );
          return null;
        }
        const text = new TextDecoder().decode(decompressed);
        const parsed = JSON.parse(text) as unknown;
        return parsed as T;
      } catch (err) {
        console.warn(
          `📦 snapshot "${source}": read failed (${
            err instanceof Error ? err.message : "unknown error"
          }) — ignoring`,
        );
        return null;
      }
    },

    async save<T>(source: string, body: T): Promise<void> {
      let path: string;
      try {
        path = snapshotPath(dir, source);
      } catch (err) {
        console.warn(
          `📦 snapshot save: rejected source "${source}": ${
            err instanceof Error ? err.message : "validation error"
          }`,
        );
        return;
      }

      try {
        const json = JSON.stringify(body);
        if (json.length > maxSnapshot) {
          console.warn(
            `📦 snapshot "${source}": payload ${json.length} B exceeds ${maxSnapshot} B cap — not writing`,
          );
          return;
        }
        const gzipped = Bun.gzipSync(new TextEncoder().encode(json));
        // Bun.write performs an atomic temp-file rename internally,
        // so a crashed flush never leaves a partial file behind.
        await Bun.write(path, gzipped);
      } catch (err) {
        // Best-effort. A disk-full or permission error must never crash
        // the caller — failure to persist is logged, not thrown.
        console.warn(
          `📦 snapshot "${source}": write failed (${
            err instanceof Error ? err.message : "unknown error"
          })`,
        );
      }
    },
  };
}

/** Default snapshot store — reads/writes
 *  `src/server/data/snapshots/<source>.json.gz`. */
export const fileSnapshotStore = createFileSnapshotStore();
