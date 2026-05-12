import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import { $ } from "bun";
import {
  createFileSnapshotStore,
  snapshotPath,
  DEFAULT_MAX_GZIP_BYTES,
  DEFAULT_MAX_SNAPSHOT_BYTES,
} from "../../src/server/lib/snapshotStore";

// ── Test helpers (Bun-native, no node imports) ───────────────────────

function makeTmpDir(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `tests/.tmp/snapstore-${rand}`;
}

async function rmDir(dir: string): Promise<void> {
  await $`rm -rf ${dir}`.quiet();
}

function muteWarn() {
  return spyOn(console, "warn").mockImplementation(() => {});
}

// ─────────────────────────────────────────────────────────────────────

describe("snapshotStore — source validation (path-traversal guard)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = makeTmpDir();
    await $`mkdir -p ${dir}`.quiet();
  });
  afterEach(async () => {
    await rmDir(dir);
  });

  test("snapshotPath rejects empty string", () => {
    expect(() => snapshotPath(dir, "")).toThrow();
  });

  test("snapshotPath rejects path traversal: ..", () => {
    expect(() => snapshotPath(dir, "..")).toThrow();
    expect(() => snapshotPath(dir, "../etc/passwd")).toThrow();
  });

  test("snapshotPath rejects forward slash", () => {
    expect(() => snapshotPath(dir, "foo/bar")).toThrow();
  });

  test("snapshotPath rejects backslash", () => {
    expect(() => snapshotPath(dir, "foo\\bar")).toThrow();
  });

  test("snapshotPath rejects null byte", () => {
    expect(() => snapshotPath(dir, "foo\0")).toThrow();
  });

  test("snapshotPath rejects uppercase", () => {
    expect(() => snapshotPath(dir, "Aircraft")).toThrow();
  });

  test("snapshotPath rejects leading digit", () => {
    expect(() => snapshotPath(dir, "1aircraft")).toThrow();
  });

  test("snapshotPath rejects leading hyphen", () => {
    expect(() => snapshotPath(dir, "-aircraft")).toThrow();
  });

  test("snapshotPath rejects > 32 chars", () => {
    expect(() => snapshotPath(dir, "a".repeat(33))).toThrow();
  });

  test("snapshotPath accepts valid names", () => {
    expect(snapshotPath(dir, "aircraft")).toBe(`${dir}/aircraft.json.gz`);
    expect(snapshotPath(dir, "ships")).toBe(`${dir}/ships.json.gz`);
    expect(snapshotPath(dir, "a")).toBe(`${dir}/a.json.gz`);
    expect(snapshotPath(dir, "a-b-c")).toBe(`${dir}/a-b-c.json.gz`);
    expect(snapshotPath(dir, "a1b2c3")).toBe(`${dir}/a1b2c3.json.gz`);
    expect(snapshotPath(dir, "a".repeat(32))).toBe(
      `${dir}/${"a".repeat(32)}.json.gz`,
    );
  });

  test("load() returns null for invalid source (no throw)", async () => {
    using _ = muteWarn();
    const store = createFileSnapshotStore({ dir });
    expect(await store.load("../etc/passwd")).toBe(null);
    expect(await store.load("foo/bar")).toBe(null);
    expect(await store.load("")).toBe(null);
    expect(await store.load("Aircraft")).toBe(null);
  });

  test("save() with invalid source is a no-op (no throw, no file written)", async () => {
    using _ = muteWarn();
    const store = createFileSnapshotStore({ dir });
    await store.save("../escape", { hello: "world" });
    const escaped = Bun.file(`${dir}/../escape.json.gz`);
    expect(await escaped.exists()).toBe(false);
  });
});

describe("snapshotStore — round trip", () => {
  let dir: string;
  beforeEach(async () => {
    dir = makeTmpDir();
    await $`mkdir -p ${dir}`.quiet();
  });
  afterEach(async () => {
    await rmDir(dir);
  });

  test("save then load returns the same payload", async () => {
    const store = createFileSnapshotStore({ dir });
    const body = {
      ac: [
        { hex: "abc123", lat: 1.5, lon: -2.5, gs: 420 },
        { hex: "def456", lat: 51.1, lon: -0.4, gs: 220 },
      ],
    };
    await store.save("aircraft", body);
    const loaded = await store.load<typeof body>("aircraft");
    expect(loaded).toEqual(body);
  });

  test("save writes to <dir>/<source>.json.gz", async () => {
    const store = createFileSnapshotStore({ dir });
    await store.save("aircraft", { ac: [] });
    const file = Bun.file(`${dir}/aircraft.json.gz`);
    expect(await file.exists()).toBe(true);
    expect(file.size).toBeGreaterThan(0);
  });

  test("missing file returns null", async () => {
    const store = createFileSnapshotStore({ dir });
    expect(await store.load("aircraft")).toBe(null);
  });

  test("empty file returns null", async () => {
    using _ = muteWarn();
    const store = createFileSnapshotStore({ dir });
    await Bun.write(`${dir}/aircraft.json.gz`, "");
    expect(await store.load("aircraft")).toBe(null);
  });

  test("non-gzip content returns null (does not throw)", async () => {
    using _ = muteWarn();
    const store = createFileSnapshotStore({ dir });
    await Bun.write(`${dir}/aircraft.json.gz`, "this is not gzip");
    expect(await store.load("aircraft")).toBe(null);
  });

  test("valid gzip but malformed JSON returns null", async () => {
    using _ = muteWarn();
    const store = createFileSnapshotStore({ dir });
    await Bun.write(
      `${dir}/aircraft.json.gz`,
      Bun.gzipSync(new TextEncoder().encode("not json")),
    );
    expect(await store.load("aircraft")).toBe(null);
  });

  test("round-trip preserves nested structure and number precision", async () => {
    const store = createFileSnapshotStore({ dir });
    const body = {
      data: {
        nested: { arr: [1, 2.5, -3, null, "str"] },
        epoch: 1715000000000,
      },
    };
    await store.save("aircraft", body);
    const loaded = await store.load<typeof body>("aircraft");
    expect(loaded).toEqual(body);
  });

  test("save overwrites existing snapshot", async () => {
    const store = createFileSnapshotStore({ dir });
    await store.save("aircraft", { ac: ["v1"] });
    await store.save("aircraft", { ac: ["v2"] });
    const loaded = await store.load<{ ac: string[] }>("aircraft");
    expect(loaded?.ac).toEqual(["v2"]);
  });
});

describe("snapshotStore — size caps (DoS guard)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = makeTmpDir();
    await $`mkdir -p ${dir}`.quiet();
  });
  afterEach(async () => {
    await rmDir(dir);
  });

  test("load rejects file larger than maxGzipBytes", async () => {
    using _ = muteWarn();
    const store = createFileSnapshotStore({ dir, maxGzipBytes: 64 });
    await Bun.write(`${dir}/aircraft.json.gz`, new Uint8Array(256));
    expect(await store.load("aircraft")).toBe(null);
  });

  test("load rejects decompression bomb (decompressed > maxSnapshotBytes)", async () => {
    using _ = muteWarn();
    const store = createFileSnapshotStore({
      dir,
      maxGzipBytes: 65536,
      maxSnapshotBytes: 1024,
    });
    const big = new Uint8Array(1024 * 1024);
    await Bun.write(`${dir}/aircraft.json.gz`, Bun.gzipSync(big));
    expect(await store.load("aircraft")).toBe(null);
  });

  test("save rejects payload larger than maxSnapshotBytes (no file written)", async () => {
    using _ = muteWarn();
    const store = createFileSnapshotStore({ dir, maxSnapshotBytes: 64 });
    const payload = { data: "x".repeat(1024) };
    await store.save("aircraft", payload);
    const file = Bun.file(`${dir}/aircraft.json.gz`);
    expect(await file.exists()).toBe(false);
  });

  test("default size caps are sane (25 MB / 100 MB)", () => {
    expect(DEFAULT_MAX_GZIP_BYTES).toBe(25 * 1024 * 1024);
    expect(DEFAULT_MAX_SNAPSHOT_BYTES).toBe(100 * 1024 * 1024);
  });
});

describe("snapshotStore — write isolation", () => {
  let dir: string;
  beforeEach(async () => {
    dir = makeTmpDir();
    await $`mkdir -p ${dir}`.quiet();
  });
  afterEach(async () => {
    await rmDir(dir);
  });

  test("save errors do not throw (best-effort contract)", async () => {
    using _ = muteWarn();
    const store = createFileSnapshotStore({
      dir: `${dir}/bad\0dir`,
    });
    await expect(store.save("aircraft", { ac: [] })).resolves.toBeUndefined();
  });

  test("two snapshots in the same dir don't collide", async () => {
    const store = createFileSnapshotStore({ dir });
    await store.save("aircraft", { ac: ["a"] });
    await store.save("ships", { vessels: ["s"] });
    const a = await store.load<{ ac: string[] }>("aircraft");
    const s = await store.load<{ vessels: string[] }>("ships");
    expect(a?.ac).toEqual(["a"]);
    expect(s?.vessels).toEqual(["s"]);
  });
});
