import { describe, test, expect } from "bun:test";
import {
  classifyMilitary,
  parseMetadataNdjson,
  enrichRecord,
  loadMetadataDb,
  __resetMetadataDbCacheForTests,
  type AircraftMetadataRecord,
} from "../../../src/server/api/aircraftEnrichment";

// ── classifyMilitary — three OR'd rules ───────────────────────────
// Rule 1: typecode in MIL_TYPECODES set
// Rule 2: operator string contains a military keyword (15-keyword list)
// Rule 3: hex in US-mil range 0xAE0000–0xAFFFFF
// (Mirrored verbatim from the previous client-side typeLookup.ts.)

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
    expect(classifyMilitary("a1b2c3", undefined)).toBe(false);
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

// ── parseMetadataNdjson ─────────────────────────────────────────

describe("parseMetadataNdjson", () => {
  test("parses one record per line into a hex-keyed Map", () => {
    const ndjson = [
      `{"i":"abc123","r":"Boeing 737","tc":"B738","md":"737-800","mf":"BOEING","rg":"N123AA","op":"American","oi":"AAL","ca":"L2J"}`,
      `{"i":"ae0001","r":"WC130J","tc":"WC30","op":"United States Air Force"}`,
    ].join("\n");
    const map = parseMetadataNdjson(ndjson);
    expect(map.size).toBe(2);
    const civ = map.get("abc123") as AircraftMetadataRecord | undefined;
    expect(civ?.resolvedType).toBe("Boeing 737");
    expect(civ?.registration).toBe("N123AA");
    expect(civ?.operator).toBe("American");
    expect(civ?.military).toBe(false);
  });

  test("attaches computed military flag (operator-rule path)", () => {
    const ndjson = `{"i":"ae0001","r":"WC130J","tc":"WC30","op":"United States Air Force"}`;
    const map = parseMetadataNdjson(ndjson);
    expect(map.get("ae0001")?.military).toBe(true);
  });

  test("skips malformed lines without throwing", () => {
    const ndjson = [
      `{"i":"abc123","r":"OK"}`,
      `not json`,
      `{}`,
      `{"r":"no-icao"}`,
      `{"i":"def456","r":"OK2"}`,
    ].join("\n");
    const map = parseMetadataNdjson(ndjson);
    expect(map.size).toBe(2);
    expect(map.has("abc123")).toBe(true);
    expect(map.has("def456")).toBe(true);
  });

  test("handles a trailing newline", () => {
    const ndjson = `{"i":"abc","r":"x"}\n`;
    expect(parseMetadataNdjson(ndjson).size).toBe(1);
  });

  test("empty input → empty map", () => {
    expect(parseMetadataNdjson("").size).toBe(0);
  });
});

// ── enrichRecord ─────────────────────────────────────────────────

describe("enrichRecord", () => {
  const civDb: Map<string, AircraftMetadataRecord> = new Map([
    [
      "abc123",
      {
        icao24: "abc123",
        resolvedType: "Boeing 737",
        typecode: "B738",
        model: "737-800",
        manufacturerName: "BOEING",
        registration: "N123AA",
        operator: "American Airlines",
        operatorIcao: "AAL",
        categoryDescription: "Large jet",
        military: false,
      },
    ],
  ]);

  test("merges DB metadata into the raw adsb.fi record", () => {
    const raw = { hex: "abc123", flight: "AAL123", lat: 40, lon: -100 };
    const enriched = enrichRecord(raw, civDb) as Record<string, unknown>;
    expect(enriched.acType).toBe("Boeing 737");
    expect(enriched.registration).toBe("N123AA");
    expect(enriched.operator).toBe("American Airlines");
    expect(enriched.military).toBe(false);
    expect(enriched.hex).toBe("abc123"); // raw fields preserved
    expect(enriched.flight).toBe("AAL123");
  });

  test("matches DB key case-insensitively (raw hex may be uppercase)", () => {
    const raw = { hex: "ABC123" };
    const enriched = enrichRecord(raw, civDb) as Record<string, unknown>;
    expect(enriched.acType).toBe("Boeing 737");
  });

  test("missing DB entry — military still derived from hex range (rule 3)", () => {
    const raw = { hex: "ae0001" };
    const enriched = enrichRecord(raw, new Map()) as Record<string, unknown>;
    expect(enriched.acType).toBe("Unknown");
    expect(enriched.military).toBe(true); // 0xAE0001 in US-mil range
  });

  test("missing DB entry + non-mil hex → military false", () => {
    const raw = { hex: "abc999" };
    const enriched = enrichRecord(raw, new Map()) as Record<string, unknown>;
    expect(enriched.military).toBe(false);
  });

  test("missing DB entry — falls back to adsb.fi typecode (`t` field) for mil rule", () => {
    // adsb.fi sends typecode in field `t`. If DB has no entry, classifyMilitary
    // should still consider the live `t` field for the typecode rule.
    const raw = { hex: "abc999", t: "F35" };
    const enriched = enrichRecord(raw, new Map()) as Record<string, unknown>;
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
    const enriched = enrichRecord(raw, civDb) as Record<string, unknown>;
    expect(enriched.acType).toBe("Unknown");
    expect(enriched.military).toBe(false);
    expect(enriched.flight).toBe("X");
  });
});

// ── loadMetadataDb — lazy load ──────────────────────────────────

describe("loadMetadataDb", () => {
  test("loads NDJSON from path, then caches the parsed map across calls", async () => {
    __resetMetadataDbCacheForTests();
    // The test fixture is a tiny NDJSON we control — keeps the test self-
    // contained and doesn't depend on the 51 MB production DB.
    const path = "tests/fixtures/aircraft/metadata-db-tiny.ndjson";
    const a = await loadMetadataDb(path);
    expect(a.size).toBeGreaterThan(0);

    // Second call returns the same Map instance (cached promise)
    const b = await loadMetadataDb(path);
    expect(b).toBe(a);
  });

  test("returns an empty Map when the file is missing (best-effort)", async () => {
    __resetMetadataDbCacheForTests();
    const map = await loadMetadataDb(
      "tests/fixtures/aircraft/does-not-exist.ndjson",
    );
    expect(map.size).toBe(0);
  });
});
