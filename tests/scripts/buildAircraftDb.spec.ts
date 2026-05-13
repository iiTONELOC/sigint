import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { buildAircraftDb } from "../../scripts/build-aircraft-db";
import { mkTmpDir } from "../_support";

// ── scripts/build-aircraft-db.ts ──────────────────────────────────
// Verifies the NDJSON → SQLite generator produces a DB with the
// schema runtime expects, all rows ingested, and military flags
// computed per all three classifyMilitary rules. Fixture covers:
//   - civil baselines (B738, A320, Cessna)
//   - rule 1 (typecode in MIL_TYPECODES — F35, REAP)
//   - rule 2 (operator contains keyword — Royal Navy, RAF)
//   - rule 3 (icao24 in 0xAE0000–0xAFFFFF — ae5000)
//   - boundaries (0xADFFFF below, 0xB00000 above)

const FIXTURE_PATH = "tests/fixtures/aircraft/metadata-db-build.ndjson";

let tmpDir: string;
let dbPath: string;

beforeEach(async () => {
  tmpDir = await mkTmpDir("sigint-acdb-test");
  dbPath = `${tmpDir}/ac-db.sqlite`;
});

describe("scripts/build-aircraft-db: schema + row count", () => {
  test("creates an `aircraft` table with the documented columns", async () => {
    await buildAircraftDb(FIXTURE_PATH, dbPath);
    const db = new Database(dbPath, { readonly: true });
    const cols = db
      .query<{ name: string; type: string; notnull: number }, []>(
        "SELECT name, type, [notnull] FROM pragma_table_info('aircraft')",
      )
      .all();
    db.close();

    const byName = new Map(cols.map((c) => [c.name, c]));
    expect(new Set(cols.map((c) => c.name))).toEqual(
      new Set([
        "icao24",
        "resolved_type",
        "typecode",
        "model",
        "manufacturer_name",
        "registration",
        "operator",
        "operator_icao",
        "category_description",
        "military",
      ]),
    );
    // resolved_type and military are NOT NULL per the schema contract;
    // every other column may be NULL when the source row had no value.
    expect(byName.get("resolved_type")?.notnull).toBe(1);
    expect(byName.get("military")?.notnull).toBe(1);
    expect(byName.get("typecode")?.notnull).toBe(0);
  });

  test("icao24 is the primary key (one row per hex, lookup is indexed)", async () => {
    await buildAircraftDb(FIXTURE_PATH, dbPath);
    const db = new Database(dbPath, { readonly: true });
    const pk = db
      .query<{ name: string; pk: number }, []>(
        "SELECT name, pk FROM pragma_table_info('aircraft') WHERE pk > 0",
      )
      .all();
    db.close();
    expect(pk).toEqual([{ name: "icao24", pk: 1 }]);
  });

  test("ingests every well-formed row in the fixture (10 records)", async () => {
    const result = await buildAircraftDb(FIXTURE_PATH, dbPath);
    expect(result.records).toBe(10);
    const db = new Database(dbPath, { readonly: true });
    const { c } = db
      .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM aircraft")
      .get()!;
    db.close();
    expect(c).toBe(10);
  });
});

describe("scripts/build-aircraft-db: military flag — three rules", () => {
  test("rule 1 (typecode in MIL_TYPECODES) → military 1", async () => {
    await buildAircraftDb(FIXTURE_PATH, dbPath);
    const db = new Database(dbPath, { readonly: true });
    const f35 = db
      .query<{ military: number }, [string]>(
        "SELECT military FROM aircraft WHERE icao24 = ?",
      )
      .get("abc100");
    const reap = db
      .query<{ military: number }, [string]>(
        "SELECT military FROM aircraft WHERE icao24 = ?",
      )
      .get("abc105");
    db.close();
    expect(f35?.military).toBe(1);
    expect(reap?.military).toBe(1);
  });

  test("rule 2 (operator contains MIL keyword) → military 1", async () => {
    await buildAircraftDb(FIXTURE_PATH, dbPath);
    const db = new Database(dbPath, { readonly: true });
    const seaking = db
      .query<{ military: number }, [string]>(
        "SELECT military FROM aircraft WHERE icao24 = ?",
      )
      .get("abc102");
    const rafvip = db
      .query<{ military: number }, [string]>(
        "SELECT military FROM aircraft WHERE icao24 = ?",
      )
      .get("abc106");
    db.close();
    expect(seaking?.military).toBe(1);
    expect(rafvip?.military).toBe(1);
  });

  test("rule 3 (US-mil hex range 0xAE0000–0xAFFFFF) → military 1", async () => {
    await buildAircraftDb(FIXTURE_PATH, dbPath);
    const db = new Database(dbPath, { readonly: true });
    const inRange = db
      .query<{ military: number }, [string]>(
        "SELECT military FROM aircraft WHERE icao24 = ?",
      )
      .get("ae5000");
    const justBelow = db
      .query<{ military: number }, [string]>(
        "SELECT military FROM aircraft WHERE icao24 = ?",
      )
      .get("adffff");
    const justAbove = db
      .query<{ military: number }, [string]>(
        "SELECT military FROM aircraft WHERE icao24 = ?",
      )
      .get("b00000");
    db.close();
    expect(inRange?.military).toBe(1);
    expect(justBelow?.military).toBe(0);
    expect(justAbove?.military).toBe(0);
  });

  test("civilian rows (no rule matches) → military 0", async () => {
    await buildAircraftDb(FIXTURE_PATH, dbPath);
    const db = new Database(dbPath, { readonly: true });
    const civilHexes = ["abc101", "abc103", "abc104"];
    for (const hex of civilHexes) {
      const row = db
        .query<{ military: number }, [string]>(
          "SELECT military FROM aircraft WHERE icao24 = ?",
        )
        .get(hex);
      expect(row?.military).toBe(0);
    }
    db.close();
  });
});

describe("scripts/build-aircraft-db: column population", () => {
  test("populates every documented field from the source row", async () => {
    await buildAircraftDb(FIXTURE_PATH, dbPath);
    const db = new Database(dbPath, { readonly: true });
    const row = db
      .query<
        {
          icao24: string;
          resolved_type: string;
          typecode: string | null;
          model: string | null;
          manufacturer_name: string | null;
          registration: string | null;
          operator: string | null;
          operator_icao: string | null;
          category_description: string | null;
          military: number;
        },
        [string]
      >("SELECT * FROM aircraft WHERE icao24 = ?")
      .get("abc101");
    db.close();
    expect(row).toEqual({
      icao24: "abc101",
      resolved_type: "Boeing 737-800",
      typecode: "B738",
      model: "737-800",
      manufacturer_name: "BOEING",
      registration: "N123AA",
      operator: "American Airlines",
      operator_icao: "AAL",
      category_description: "L2J",
      military: 0,
    });
  });

  test("missing optional fields land as NULL, not empty string", async () => {
    await buildAircraftDb(FIXTURE_PATH, dbPath);
    const db = new Database(dbPath, { readonly: true });
    const row = db
      .query<
        {
          typecode: string | null;
          operator: string | null;
          registration: string | null;
        },
        [string]
      >(
        "SELECT typecode, operator, registration FROM aircraft WHERE icao24 = ?",
      )
      .get("ae5000");
    db.close();
    // ae5000 fixture row has no tc/op/rg — all should be SQL NULL.
    expect(row?.typecode).toBeNull();
    expect(row?.operator).toBeNull();
    expect(row?.registration).toBeNull();
  });
});

describe("scripts/build-aircraft-db: failure modes", () => {
  test("missing input file throws with a clear message", async () => {
    await expect(
      buildAircraftDb("tests/fixtures/aircraft/does-not-exist.ndjson", dbPath),
    ).rejects.toThrow(/Input NDJSON not found/);
  });

  test("malformed JSON line aborts the build with a non-zero signal", async () => {
    const badPath = `${tmpDir}/bad.ndjson`;
    await Bun.write(
      badPath,
      [
        '{"i":"abc100","r":"F-35"}',
        "this is not json",
        '{"i":"abc101","r":"OK"}',
      ].join("\n"),
    );
    await expect(buildAircraftDb(badPath, dbPath)).rejects.toThrow(
      /Malformed JSON/,
    );
  });

  test("missing icao24 (`i`) field aborts the build", async () => {
    const badPath = `${tmpDir}/no-icao.ndjson`;
    await Bun.write(
      badPath,
      [
        '{"i":"abc100","r":"OK"}',
        '{"r":"missing-icao"}',
        '{"i":"abc101","r":"OK"}',
      ].join("\n"),
    );
    await expect(buildAircraftDb(badPath, dbPath)).rejects.toThrow(
      /Missing icao24/,
    );
  });

  test("re-running on an existing path overwrites the prior DB", async () => {
    await buildAircraftDb(FIXTURE_PATH, dbPath);
    expect(await Bun.file(dbPath).exists()).toBe(true);
    // A second call must not throw "table already exists" — the build
    // unlinks the prior file before opening a fresh connection.
    const second = await buildAircraftDb(FIXTURE_PATH, dbPath);
    expect(second.records).toBe(10);
  });
});
