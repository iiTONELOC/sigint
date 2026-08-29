import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import { utimes } from "fs/promises";
import {
  classifyMilitary,
  enrichRecord,
  loadMetadataDb,
  __resetMetadataDbCacheForTests,
  __setLoggerForTests,
  AC_DB_STALE_THRESHOLD_MS,
} from "../../../src/server/api/aircraftEnrichment";
import { createLogger, LogLevel } from "../../../src/server/lib/logger";
import { buildAircraftDb } from "../../../scripts/build-aircraft-db";
import { mkTmpDir, rmrf } from "../../_support";
async function setMtimeDaysAgoAsync(
  path: string,
  daysAgo: number,
): Promise<void> {
  const target = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await utimes(path, target, target);
}

// ── Test setup: build a tmp SQLite from the tiny fixture NDJSON ──
// The runtime now reads enrichment from a SQLite file, so the test
// suite builds one out of the existing tiny fixture (round-tripping
// through the same build script that ships in production). Runtime
// lookups use the prepared statement opened by loadMetadataDb(dbPath).

const FIXTURE_NDJSON = "tests/fixtures/aircraft/metadata-db-tiny.ndjson";
const ORIGIN_COUNTRY_BY_ICAO24 = {
  "200000": "",
  "3c0000": "Germany",
  abc123: "United States",
  ae9999: "United States",
};

let tmpDir: string;
let dbPath: string;

beforeAll(async () => {
  tmpDir = await mkTmpDir("sigint-aenrich-test");
  dbPath = `${tmpDir}/ac-db.sqlite`;
  await buildAircraftDb(FIXTURE_NDJSON, dbPath);
});

afterAll(async () => {
  __resetMetadataDbCacheForTests();
  try {
    await rmrf(tmpDir);
  } catch {
    /* tmpdir cleanup is best-effort */
  }
});

// ── classifyMilitary: three OR'd rules ───────────────────────────
// Rule 1: typecode in MIL_TYPECODES set
// Rule 2: operator string contains a military keyword (15-keyword list)
// Rule 3: hex in US-mil range 0xAE0000–0xAFFFFF
// (Logic now lives in src/server/data/militaryRules.ts; aircraft
// Enrichment re-exports for caller compat.)

describe("classifyMilitary: typecode rule", () => {
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

describe("classifyMilitary: operator rule", () => {
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

describe("classifyMilitary: US-mil hex range rule", () => {
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
  // tiny fixture. Every lookup goes through the prepared SELECT inside
  // enrichRecord.
  beforeAll(async () => {
    __resetMetadataDbCacheForTests();
    await loadMetadataDb(dbPath);
  });

  test("merges DB metadata into the raw adsb.fi record", () => {
    const raw = { hex: "abc123", flight: "AAL123", lat: 40, lon: -100 };
    const enriched = enrichRecord(raw);
    expect(enriched.acType).toBe("Boeing 737");
    expect(enriched.registration).toBe("N123AA");
    expect(enriched.operator).toBe("American Airlines");
    expect(enriched.military).toBe(false);
    expect(enriched.hex).toBe("abc123"); // raw fields preserved
    expect(enriched.flight).toBe("AAL123");
  });

  for (const [hex, originCountry] of Object.entries(ORIGIN_COUNTRY_BY_ICAO24)) {
    test(`derives the origin country for ${hex}`, () => {
      expect(enrichRecord({ hex }).originCountry).toBe(originCountry);
    });
  }

  test("matches DB key case-insensitively (raw hex may be uppercase)", () => {
    const raw = { hex: "ABC123" };
    const enriched = enrichRecord(raw);
    expect(enriched.acType).toBe("Boeing 737");
  });

  test("missing DB entry still derives military from hex range (rule 3)", () => {
    // ae9999 is in the US-mil hex range but absent from the fixture,
    // so the lookup misses and classifyMilitary fires off the hex.
    const raw = { hex: "ae9999" };
    const enriched = enrichRecord(raw);
    expect(enriched.acType).toBe("Unknown");
    expect(enriched.military).toBe(true); // 0xAE9999 in US-mil range
  });

  test("missing DB entry + non-mil hex → military false", () => {
    const raw = { hex: "abc999" };
    const enriched = enrichRecord(raw);
    expect(enriched.military).toBe(false);
  });

  test("missing DB entry uses the adsb.fi typecode (`t` field) for mil rule", () => {
    // adsb.fi sends typecode in field `t`. If DB has no entry, classifyMilitary
    // should still consider the live `t` field for the typecode rule.
    const raw = { hex: "abc999", t: "F35" };
    const enriched = enrichRecord(raw);
    expect(enriched.military).toBe(true);
  });

  test("rejects non-object input gracefully", () => {
    expect(enrichRecord(null)).toEqual({});
    expect(enrichRecord(undefined)).toEqual({});
    expect(enrichRecord("string")).toEqual({});
    expect(enrichRecord(42)).toEqual({});
  });

  test("missing hex field → returns record with default enrichment, no DB lookup", () => {
    const raw = { flight: "X", lat: 0, lon: 0 };
    const enriched = enrichRecord(raw);
    expect(enriched.acType).toBe("Unknown");
    expect(enriched.military).toBe(false);
    expect(enriched.flight).toBe("X");
  });
});

// ── loadMetadataDb: lazy SQLite open ──────────────────────────

describe("loadMetadataDb", () => {
  test("loads SQLite from path, then caches the prepared statement across calls", async () => {
    __resetMetadataDbCacheForTests();
    // The first call opens the SQLite file and prepares the lookup
    // statement; the second call is a no-op cache hit that re-uses
    // the same handle. Successful enrichment after both calls
    // demonstrates the prepared statement survived.
    await loadMetadataDb(dbPath);
    await loadMetadataDb(dbPath);

    const enriched = enrichRecord({ hex: "abc123" });
    expect(enriched.acType).toBe("Boeing 737");
  });

  test("returns without data when the file is missing (best-effort)", async () => {
    __resetMetadataDbCacheForTests();
    const result = await loadMetadataDb(
      "tests/fixtures/aircraft/does-not-exist.sqlite",
    );
    expect(result).toBeUndefined();
  });
});

// ── DB freshness check at boot ────────────────────────────────────
// At first SQLite open, ensureDb() reads the file's mtime and warns
// if the artifact is older than AC_DB_STALE_THRESHOLD_MS (90 days).
// The warning surfaces operator action: regenerate via
// `bun run build:aircraft-db`, but never blocks boot.

describe("aircraft DB freshness check", () => {
  const FRESH_DB_FIXTURE = "tests/fixtures/aircraft/metadata-db-tiny.ndjson";
  let freshTmpDir: string;
  let freshDbPath: string;

  type Captured = { level: string; message: string };
  let captured: Captured[] = [];

  function installCapture(): void {
    captured = [];
    const sink = {
      async write(chunk: Uint8Array): Promise<void> {
        const text = new TextDecoder().decode(chunk);
        for (const line of text.split("\n")) {
          if (!line) continue;
          try {
            const entry = JSON.parse(line) as Captured;
            captured.push(entry);
          } catch {
            /* non-JSON line; ignore */
          }
        }
      },
    };
    __setLoggerForTests(
      createLogger({
        service: "aircraft-enrichment",
        level: LogLevel.Debug,
        sink,
      }),
    );
  }

  function restoreLogger(): void {
    __setLoggerForTests(createLogger({ service: "aircraft-enrichment" }));
  }

  beforeAll(async () => {
    freshTmpDir = await mkTmpDir("sigint-freshness-test");
    freshDbPath = `${freshTmpDir}/ac-db.sqlite`;
    await buildAircraftDb(FRESH_DB_FIXTURE, freshDbPath);
  });

  beforeEach(() => {
    __resetMetadataDbCacheForTests();
    installCapture();
  });

  afterEach(() => {
    restoreLogger();
  });

  afterAll(async () => {
    __resetMetadataDbCacheForTests();
    try {
      await rmrf(freshTmpDir);
    } catch {
      /* tmp cleanup is best-effort */
    }
  });

  function findWarnMatching(substr: string): Captured | undefined {
    return captured.find(
      (c) => c.level === "warn" && c.message.includes(substr),
    );
  }

  test("THRESHOLD constant is the documented 90-day window", () => {
    expect(AC_DB_STALE_THRESHOLD_MS).toBe(90 * 24 * 3600 * 1000);
  });

  test("DB older than 90 days → warn fires with day count + ISO timestamp", async () => {
    await setMtimeDaysAgoAsync(freshDbPath, 91);
    await loadMetadataDb(freshDbPath);
    const stale = findWarnMatching("ac-db.sqlite is ");
    expect(stale).toBeDefined();
    const msg = stale!.message;
    expect(msg).toMatch(/ac-db\.sqlite is 91 days old/);
    expect(msg).toContain("bun run build:aircraft-db");
    expect(msg).toMatch(/last built \d{4}-\d{2}-\d{2}T/);
  });

  test("DB at exact 90-day boundary → warn fires (>=, not >)", async () => {
    await setMtimeDaysAgoAsync(freshDbPath, 90);
    await loadMetadataDb(freshDbPath);
    expect(findWarnMatching("ac-db.sqlite is ")).toBeDefined();
  });

  test("DB at 89 days → no freshness warn", async () => {
    await setMtimeDaysAgoAsync(freshDbPath, 89);
    await loadMetadataDb(freshDbPath);
    expect(findWarnMatching("ac-db.sqlite is ")).toBeUndefined();
  });

  test("DB freshly built (mtime = now) → no freshness warn", async () => {
    await setMtimeDaysAgoAsync(freshDbPath, 0);
    await loadMetadataDb(freshDbPath);
    expect(findWarnMatching("ac-db.sqlite is ")).toBeUndefined();
  });

  test("missing DB file → falls through to existing skip path, no freshness warn", async () => {
    await loadMetadataDb("tests/fixtures/aircraft/does-not-exist.sqlite");
    expect(findWarnMatching("enrichment DB not found")).toBeDefined();
    expect(findWarnMatching("days old")).toBeUndefined();
  });
});
