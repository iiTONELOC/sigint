import { describe, test, expect } from "bun:test";
import { resolve } from "path";

// Fixtures are test-only. Never under public/ — production must not be able
// to serve fake storm data. bun:test loads via Bun.file(...).json();
// Playwright mocks via page.route("**/api/cyclones/latest", ...).

const FIXTURE_DIR = resolve(import.meta.dir, "cyclones");

const EXPECTED_FIXTURES = [
  "empty-out-of-season.json",
  "tropical-depression.json",
  "subtropical-example.json",
  "single-cat3.json",
  "single-cat5.json",
  "multi-storm.json",
] as const;

const SYNTHETIC_FIXTURES = EXPECTED_FIXTURES.filter(
  (f) => f !== "empty-out-of-season.json",
);

const SYNTHETIC_DISCLOSURE =
  "Synthetic test fixture, modeled on NHC CurrentStorms.json schema. Not a real storm.";

type FixtureShape = {
  _comment?: string;
  activeStorms?: Array<Record<string, unknown>>;
};

async function loadFixture(name: string): Promise<FixtureShape> {
  return (await Bun.file(resolve(FIXTURE_DIR, name)).json()) as FixtureShape;
}

// ── Existence + JSON validity ──────────────────────────────────────

describe("tests/fixtures/cyclones/ — file presence", () => {
  for (const name of EXPECTED_FIXTURES) {
    test(`${name} exists and is valid JSON via Bun.file().json()`, async () => {
      const file = Bun.file(resolve(FIXTURE_DIR, name));
      expect(await file.exists()).toBe(true);
      const json = await loadFixture(name);
      expect(json).toBeDefined();
    });
  }
});

// ── activeStorms array shape ───────────────────────────────────────

describe("tests/fixtures/cyclones/ — activeStorms", () => {
  for (const name of EXPECTED_FIXTURES) {
    test(`${name} has activeStorms array`, async () => {
      const json = await loadFixture(name);
      expect(Array.isArray(json.activeStorms)).toBe(true);
    });
  }

  test("empty-out-of-season has zero storms (verbatim from current live response)", async () => {
    const json = await loadFixture("empty-out-of-season.json");
    expect(json.activeStorms).toEqual([]);
  });

  test("multi-storm has exactly 3 storms (Atlantic + Atlantic + East Pacific)", async () => {
    const json = await loadFixture("multi-storm.json");
    expect(json.activeStorms?.length).toBe(3);
    const ids = (json.activeStorms ?? []).map((s) => s.id);
    expect(ids).toEqual(["al072026", "al082026", "ep042026"]);
  });
});

// ── Synthetic disclosure ───────────────────────────────────────────
// Each synthetic fixture's first JSON key is `_comment`, carrying the
// exact disclosure text. JSON has no native comments and the contract
// pins fixture loading to Bun.file(...).json(), so we use a top-line
// `_comment` key as the JSON-equivalent of the documented "top-line
// comment" instruction.

describe("tests/fixtures/cyclones/ — synthetic disclosure", () => {
  for (const name of SYNTHETIC_FIXTURES) {
    test(`${name} carries the exact synthetic disclosure text`, async () => {
      const json = await loadFixture(name);
      expect(json._comment).toBe(SYNTHETIC_DISCLOSURE);
    });

    test(`${name} has _comment as the first JSON key (top-line marker)`, async () => {
      const text = await Bun.file(resolve(FIXTURE_DIR, name)).text();
      const parsed = JSON.parse(text);
      expect(Object.keys(parsed)[0]).toBe("_comment");
    });
  }

  test("empty-out-of-season has no _comment (verbatim from live, no synthetic marker)", async () => {
    const json = await loadFixture("empty-out-of-season.json");
    expect(json._comment).toBeUndefined();
  });
});

// ── NHC CurrentStorms.json schema conformance ─────────────────────

describe("tests/fixtures/cyclones/ — NHC schema", () => {
  for (const name of EXPECTED_FIXTURES) {
    test(`${name} storms have all NHC fields parseNhc.ts depends on`, async () => {
      const json = await loadFixture(name);
      for (const s of json.activeStorms ?? []) {
        expect(typeof s.id).toBe("string");
        expect(typeof s.name).toBe("string");
        expect(typeof s.classification).toBe("string");
        expect(typeof s.intensity).toBe("string");
        expect(typeof s.pressure).toBe("string");
        expect(typeof s.latitudeNumeric).toBe("number");
        expect(typeof s.longitudeNumeric).toBe("number");
        expect(typeof s.movementDir).toBe("number");
        expect(typeof s.movementSpeed).toBe("number");
        expect(typeof s.lastUpdate).toBe("string");
      }
    });
  }

  test("storm ids use lowercase basin+number+year per NHC convention", async () => {
    for (const name of EXPECTED_FIXTURES) {
      const json = await loadFixture(name);
      for (const s of json.activeStorms ?? []) {
        expect(s.id).toMatch(/^(al|ep|cp)\d{2}\d{4}$/);
      }
    }
  });

  test("storm names use STORM_TEST_* placeholders so they can't be confused with real storms", async () => {
    for (const name of SYNTHETIC_FIXTURES) {
      const json = await loadFixture(name);
      for (const s of json.activeStorms ?? []) {
        expect(s.name).toMatch(/^STORM_TEST_/);
      }
    }
  });

  test("forecast points (when present) include the fields parseNhc.ts maps", async () => {
    for (const name of EXPECTED_FIXTURES) {
      const json = await loadFixture(name);
      for (const s of json.activeStorms ?? []) {
        const forecast = s.forecast as
          | Array<Record<string, unknown>>
          | undefined;
        if (!forecast) continue;
        for (const f of forecast) {
          expect(typeof f.fcstHour).toBe("number");
          expect(typeof f.validTime).toBe("string");
          expect(typeof f.latitude).toBe("number");
          expect(typeof f.longitude).toBe("number");
          expect(typeof f.maxWind).toBe("number");
        }
      }
    }
  });
});

// ── multi-storm targeted shape ─────────────────────────────────────
// Storm A is the geometry pillar for the Ships Sheltering and
// Cyclone-Path Events correlation rules (steps 10/16). It must expose
// movementDir + ≤72h forecast points so those rules can fire when paired
// with matching ship/event fixtures later.

describe("multi-storm.json — correlation-rule preconditions", () => {
  test("Storm A (al072026) has movementDir set for lee-quadrant computation", async () => {
    const json = await loadFixture("multi-storm.json");
    const stormA = (json.activeStorms ?? []).find((s) => s.id === "al072026");
    expect(stormA).toBeDefined();
    expect(typeof stormA?.movementDir).toBe("number");
  });

  test("Storm A has at least one forecast point with fcstHour ≤ 72", async () => {
    const json = await loadFixture("multi-storm.json");
    const stormA = (json.activeStorms ?? []).find((s) => s.id === "al072026");
    const fc = stormA?.forecast as Array<{ fcstHour: number }> | undefined;
    expect(fc).toBeDefined();
    expect((fc ?? []).some((p) => p.fcstHour <= 72)).toBe(true);
  });
});
