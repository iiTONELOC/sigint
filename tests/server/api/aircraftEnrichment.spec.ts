import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, utimesSync } from "node:fs";
import {
  classifyMilitary,
  enrichRecord,
  loadMetadataDb,
  __resetMetadataDbCacheForTests,
  AC_DB_STALE_THRESHOLD_MS,
  type AircraftMetadataRecord,
} from "../../../src/server/api/aircraftEnrichment";
import { buildAircraftDb } from "../../../scripts/build-aircraft-db";

// ── Test setup — build a tmp SQLite from the tiny fixture NDJSON ──
// The runtime now reads enrichment from a SQLite file, so the test
// suite builds one out of the existing tiny fixture (round-tripping
// through the same build script that ships in production). The Map
// argument that enrichRecord still takes for signature parity is
// passed empty in every test — actual lookups go through the
// prepared statement opened by loadMetadataDb(dbPath).

const FIXTURE_NDJSON = "tests/fixtures/aircraft/metadata-db-tiny.ndjson";

let tmpDir: string;
let dbPath: string;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "sigint-aenrich-test-"));
  dbPath = join(tmpDir, "ac-db.sqlite");
  await buildAircraftDb(FIXTURE_NDJSON, dbPath);
});

afterAll(() => {
  __resetMetadataDbCacheForTests();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* tmpdir cleanup is best-effort */
  }
});

// ── classifyMilitary — three OR'd rules ───────────────────────────
// Rule 1: typecode in MIL_TYPECODES set
// Rule 2: operator string contains a military keyword (15-keyword list)
// Rule 3: hex in US-mil range 0xAE0000–0xAFFFFF
// (Logic now lives in src/server/data/militaryRules.ts; aircraft
// Enrichment re-exports for caller compat.)

describe("classifyMilitary — typecode rule", () => {
  test("known mil typecode (F35) → true", () => {
    expect(classifyMilitary("a1b2c3", "F35")).toBe(true);
  });

  test("typecode case-insensitive (b52 → B52 in set)", () => {
    expect(classifyMilitary("a1b2c3", "b52")).toBe(true);
  });

  test("civil typecode (B738) → false", () => {
    expect(classifyMilitary("a1b2c3", "B738")).toBe(false);
  });

  test("missing typecode falls through to other rules", () => {
    expect(classifyMilitary("a1b2c3")).toBe(false);
  });
});

describe("classifyMilitary — operator rule", () => {
  test("'United States Air Force' → true", () => {
    expect(
      classifyMilitary("a1b2c3", undefined, "United States Air Force"),
    ).toBe(true);
  });

  test("'Royal Navy' → true", () => {
    expect(classifyMilitary("a1b2c3", undefined, "Royal Navy")).toBe(true);
  });

  test("'Luftwaffe' (German air force) matches the multi-language list", () => {
    expect(classifyMilitary("a1b2c3", undefined, "Luftwaffe")).toBe(true);
  });

  test("operator case-insensitive", () => {
    expect(classifyMilitary("a1b2c3", undefined, "BUNDESWEHR ARMY")).toBe(true);
  });

  test("'United Airlines' → false", () => {
    expect(classifyMilitary("a1b2c3", undefined, "United Airlines")).toBe(
      false,
    );
  });
});

describe("classifyMilitary — US-mil hex range rule", () => {
  test("0xAE0000 (low boundary) → true", () => {
    expect(classifyMilitary("ae0000")).toBe(true);
  });

  test("0xAEFFFF (mid range) → true", () => {
    expect(classifyMilitary("aeffff")).toBe(true);
  });

  test("0xAFFFFF (high boundary) → true", () => {
    expect(classifyMilitary("afffff")).toBe(true);
  });

  test("0xADFFFF (just below low) → false", () => {
    expect(classifyMilitary("adffff")).toBe(false);
  });

  test("0xB00000 (just above high) → false", () => {
    expect(classifyMilitary("b00000")).toBe(false);
  });

  test("any of the three rules wins (OR semantics)", () => {
    // Civil typecode + civil operator + non-mil hex → false
    expect(classifyMilitary("abc123", "B738", "United Airlines")).toBe(false);
    // Civil typecode + mil hex → true via rule 3
    expect(classifyMilitary("ae1234", "B738", "United Airlines")).toBe(true);
  });
});

// ── enrichRecord ─────────────────────────────────────────────────

describe("enrichRecord", () => {
  // Wire the prepared-statement cache to the tmp SQLite built from the
  // tiny fixture. The Map below is preserved for signature parity but
  // is unused by the SQLite path — every lookup goes through the
  // prepared SELECT inside enrichRecord.
  beforeAll(async () => {
    __resetMetadataDbCacheForTests();
    await loadMetadataDb(dbPath);
  });

  const civDb: Map<string, AircraftMetadataRecord> = new Map();

  test("merges DB metadata into the raw adsb.fi record", () => {
    const raw = { hex: "abc123", flight: "AAL123", lat: 40, lon: -100 };
    const enriched = enrichRecord(raw, civDb);
    expect(enriched.acType).toBe("Boeing 737");
    expect(enriched.registration).toBe("N123AA");
    expect(enriched.operator).toBe("American Airlines");
    expect(enriched.military).toBe(false);
    expect(enriched.hex).toBe("abc123"); // raw fields preserved
    expect(enriched.flight).toBe("AAL123");
  });

  test("populates originCountry from icao24 hex range (Annex 10)", () => {
    // hex 0xABC123 falls in the US block 0xA00000–0xAFFFFF.
    const raw = { hex: "abc123" };
    const enriched = enrichRecord(raw, civDb);
    expect(enriched.originCountry).toBe("United States");
  });

  test("originCountry derives even on DB miss — same hex-prefix lookup", () => {
    // ae9999 is in the US-mil hex range (also US block) and absent
    // from the fixture — DB miss, but originCountry still lands.
    const raw = { hex: "ae9999" };
    const enriched = enrichRecord(raw, civDb);
    expect(enriched.acType).toBe("Unknown");
    expect(enriched.originCountry).toBe("United States");
  });

  test("originCountry derives correctly for non-US hex (3c0000 → Germany)", () => {
    const raw = { hex: "3c0000" };
    const enriched = enrichRecord(raw, civDb);
    expect(enriched.originCountry).toBe("Germany");
  });

  test("originCountry is '' when hex falls outside every Annex 10 block", () => {
    // 0x200000 is in an unallocated EUR gap.
    const raw = { hex: "200000" };
    const enriched = enrichRecord(raw, civDb);
    expect(enriched.originCountry).toBe("");
  });

  test("matches DB key case-insensitively (raw hex may be uppercase)", () => {
    const raw = { hex: "ABC123" };
    const enriched = enrichRecord(raw, civDb);
    expect(enriched.acType).toBe("Boeing 737");
  });

  test("missing DB entry — military still derived from hex range (rule 3)", () => {
    // ae9999 is in the US-mil hex range but absent from the fixture,
    // so the lookup misses and classifyMilitary fires off the hex.
    const raw = { hex: "ae9999" };
    const enriched = enrichRecord(raw, civDb);
    expect(enriched.acType).toBe("Unknown");
    expect(enriched.military).toBe(true); // 0xAE9999 in US-mil range
  });

  test("missing DB entry + non-mil hex → military false", () => {
    const raw = { hex: "abc999" };
    const enriched = enrichRecord(raw, civDb);
    expect(enriched.military).toBe(false);
  });

  test("missing DB entry — falls back to adsb.fi typecode (`t` field) for mil rule", () => {
    // adsb.fi sends typecode in field `t`. If DB has no entry, classifyMilitary
    // should still consider the live `t` field for the typecode rule.
    const raw = { hex: "abc999", t: "F35" };
    const enriched = enrichRecord(raw, civDb);
    expect(enriched.military).toBe(true);
  });

  test("rejects non-object input gracefully", () => {
    expect(enrichRecord(null, civDb)).toEqual({});
    expect(enrichRecord(undefined, civDb)).toEqual({});
    expect(enrichRecord("string", civDb)).toEqual({});
    expect(enrichRecord(42, civDb)).toEqual({});
  });

  test("missing hex field → returns record with default enrichment, no DB lookup", () => {
    const raw = { flight: "X", lat: 0, lon: 0 };
    const enriched = enrichRecord(raw, civDb);
    expect(enriched.acType).toBe("Unknown");
    expect(enriched.military).toBe(false);
    expect(enriched.flight).toBe("X");
  });
});

// ── loadMetadataDb — lazy SQLite open ──────────────────────────

describe("loadMetadataDb", () => {
  test("loads SQLite from path, then caches the prepared statement across calls", async () => {
    __resetMetadataDbCacheForTests();
    // The first call opens the SQLite file and prepares the lookup
    // statement; the second call is a no-op cache hit that re-uses
    // the same handle. Successful enrichment after both calls
    // demonstrates the prepared statement survived.
    const a = await loadMetadataDb(dbPath);
    expect(a).toBeInstanceOf(Map);

    const b = await loadMetadataDb(dbPath);
    expect(b).toBeInstanceOf(Map);

    const enriched = enrichRecord({ hex: "abc123" }, new Map());
    expect(enriched.acType).toBe("Boeing 737");
  });

  test("returns an empty Map when the file is missing (best-effort)", async () => {
    __resetMetadataDbCacheForTests();
    const map = await loadMetadataDb(
      "tests/fixtures/aircraft/does-not-exist.sqlite",
    );
    expect(map.size).toBe(0);
  });
});

// ── DB freshness check at boot ────────────────────────────────────
// At first SQLite open, ensureDb() reads the file's mtime and warns
// if the artifact is older than AC_DB_STALE_THRESHOLD_MS (90 days).
// The warning surfaces operator action — regenerate via
// `bun run build:aircraft-db` — but never blocks boot.

describe("aircraft DB freshness check", () => {
  const FRESH_DB_FIXTURE = "tests/fixtures/aircraft/metadata-db-tiny.ndjson";
  let freshTmpDir: string;
  let freshDbPath: string;
  let warnSpy: ReturnType<typeof spyOn> | null = null;

  beforeAll(async () => {
    freshTmpDir = mkdtempSync(join(tmpdir(), "sigint-freshness-test-"));
    freshDbPath = join(freshTmpDir, "ac-db.sqlite");
    await buildAircraftDb(FRESH_DB_FIXTURE, freshDbPath);
  });

  beforeEach(() => {
    __resetMetadataDbCacheForTests();
    warnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy?.mockRestore();
    warnSpy = null;
  });

  afterAll(() => {
    __resetMetadataDbCacheForTests();
    try {
      rmSync(freshTmpDir, { recursive: true, force: true });
    } catch {
      /* tmp cleanup is best-effort */
    }
  });

  /** Set the SQLite file's mtime to N days before now so the next
   *  ensureDb() open evaluates the freshness branch with a known age. */
  function setMtimeDaysAgo(path: string, daysAgo: number): void {
    const target = (Date.now() - daysAgo * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(path, target, target);
  }

  test("THRESHOLD constant is the documented 90-day window", () => {
    expect(AC_DB_STALE_THRESHOLD_MS).toBe(90 * 24 * 3600 * 1000);
  });

  test("DB older than 90 days → warn fires with day count + ISO timestamp", async () => {
    setMtimeDaysAgo(freshDbPath, 91);
    await loadMetadataDb(freshDbPath);
    const warnCalls = warnSpy?.mock.calls ?? [];
    const stale = warnCalls.find((c) =>
      typeof c[0] === "string" && c[0].includes("ac-db.sqlite is "),
    );
    expect(stale).toBeDefined();
    const msg = stale?.[0] as string;
    expect(msg).toMatch(/ac-db\.sqlite is 91 days old/);
    expect(msg).toContain("bun run build:aircraft-db");
    expect(msg).toMatch(/last built \d{4}-\d{2}-\d{2}T/);
  });

  test("DB at exact 90-day boundary → warn fires (>=, not >)", async () => {
    // Threshold uses `>=` so day 90 is on the warn side.
    setMtimeDaysAgo(freshDbPath, 90);
    await loadMetadataDb(freshDbPath);
    const stale = (warnSpy?.mock.calls ?? []).find(
      (c) => typeof c[0] === "string" && c[0].includes("ac-db.sqlite is "),
    );
    expect(stale).toBeDefined();
  });

  test("DB at 89 days → no freshness warn", async () => {
    setMtimeDaysAgo(freshDbPath, 89);
    await loadMetadataDb(freshDbPath);
    const stale = (warnSpy?.mock.calls ?? []).find(
      (c) => typeof c[0] === "string" && c[0].includes("ac-db.sqlite is "),
    );
    expect(stale).toBeUndefined();
  });

  test("DB freshly built (mtime = now) → no freshness warn", async () => {
    // Fixture was built in beforeAll a moment ago — no mtime fiddle.
    setMtimeDaysAgo(freshDbPath, 0);
    await loadMetadataDb(freshDbPath);
    const stale = (warnSpy?.mock.calls ?? []).find(
      (c) => typeof c[0] === "string" && c[0].includes("ac-db.sqlite is "),
    );
    expect(stale).toBeUndefined();
  });

  test("missing DB file → falls through to existing skip path, no freshness warn", async () => {
    // Existing "DB not found" warn should still fire; the freshness
    // branch must not run because we never get past the existsSync.
    await loadMetadataDb("tests/fixtures/aircraft/does-not-exist.sqlite");
    const allWarns = warnSpy?.mock.calls ?? [];
    const notFound = allWarns.find(
      (c) =>
        typeof c[0] === "string" && c[0].includes("enrichment DB not found"),
    );
    const stale = allWarns.find(
      (c) => typeof c[0] === "string" && c[0].includes("days old"),
    );
    expect(notFound).toBeDefined();
    expect(stale).toBeUndefined();
  });
});
