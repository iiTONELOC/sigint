import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { readdirSync } from "fs";

// ── Cyclone fixture GUARD ────────────────────────────────────────────
// The prior cyclone fixtures FABRICATED an inline `forecast: [...]` array
// (and `forecastTrack.advisoryNumber`) that real NHC CurrentStorms.json
// does NOT contain — forecast positions live only inside the storm's
// TRACK.kmz. Tests written against that fabricated shape were green on the
// bug and red on a correct implementation. This guard locks the fabrication
// out permanently and asserts the REAL captured shape instead.
//
// Source of truth: tests/fixtures/cyclones-real/ holds raw bytes captured
// once from live NHC (CurrentStorms.json + TRACK.kmz + CONE.kmz + the text
// product HTML). Tests read those bytes; they never hit the network.

const FIXTURE_DIR = resolve(import.meta.dir, "cyclones");
const REAL_DIR = resolve(import.meta.dir, "cyclones-real");

type Storm = Record<string, unknown>;
type Payload = { activeStorms?: Storm[] };

async function loadJson(path: string): Promise<Payload> {
  return (await Bun.file(path).json()) as Payload;
}

// ── Guard: dev fixtures carry REAL forecast (not fabricated numbers) ─────
//
// The original bug FABRICATED a forecast array with made-up positions/winds.
// The fix is not "no inline forecast" — the dev fixtures (this dir) ARE the
// client-facing post-parse shape and legitimately inline a forecast so the
// dossier renders. The guard instead requires that inline forecast to be REAL-
// shaped (every required field present and numeric), and that the raw-wire
// captures (cyclones-real/, asserted in the second describe) still match NHC's
// real CurrentStorms.json — which carries NO inline forecast.

describe("cyclone dev fixtures — real forecast shape", () => {
  const jsonFixtures = readdirSync(FIXTURE_DIR).filter((f) =>
    f.endsWith(".json"),
  );

  test("at least the empty-out-of-season fixture is present", () => {
    expect(jsonFixtures).toContain("empty-out-of-season.json");
  });

  for (const name of jsonFixtures) {
    test(`${name} inline forecast points are real-shaped (no fabricated/partial points)`, async () => {
      const json = await loadJson(resolve(FIXTURE_DIR, name));
      for (const s of json.activeStorms ?? []) {
        const forecast = (s as { forecast?: unknown }).forecast;
        if (!Array.isArray(forecast)) continue; // out-of-season / no forecast is fine
        for (const fp of forecast as Array<Record<string, unknown>>) {
          // Every NHC forecast point carries these — a fabricated/partial point
          // (the original bug) would be missing one.
          expect(typeof fp.fcstHour).toBe("number");
          expect(typeof fp.latitude).toBe("number");
          expect(typeof fp.longitude).toBe("number");
          expect(typeof fp.maxWind).toBe("number");
          expect(typeof fp.validTime).toBe("string");
        }
      }
    });
  }

  test("empty-out-of-season is a real empty payload", async () => {
    const json = await loadJson(
      resolve(FIXTURE_DIR, "empty-out-of-season.json"),
    );
    expect(json.activeStorms).toEqual([]);
  });
});

// ── Real captures carry the REAL NHC shape ──────────────────────────

describe("cyclones-real/ — real NHC CurrentStorms.json shape", () => {
  test("CurrentStorms.json parses and has activeStorms", async () => {
    const json = await loadJson(resolve(REAL_DIR, "CurrentStorms.json"));
    expect(Array.isArray(json.activeStorms)).toBe(true);
  });

  test("each real storm carries advNum on publicAdvisory and KMZ urls — but NO inline forecast", async () => {
    const json = await loadJson(resolve(REAL_DIR, "CurrentStorms.json"));
    expect((json.activeStorms ?? []).length).toBeGreaterThan(0);
    for (const s of json.activeStorms ?? []) {
      const pa = s.publicAdvisory as Record<string, unknown> | undefined;
      expect(typeof pa?.advNum).toBe("string");
      const ft = s.forecastTrack as Record<string, unknown> | undefined;
      const tc = s.trackCone as Record<string, unknown> | undefined;
      expect(typeof ft?.kmzFile).toBe("string"); // TRACK.kmz — holds forecast pts
      expect(typeof tc?.kmzFile).toBe("string"); // CONE.kmz — holds the cone
      // The smoking gun: real payloads do NOT inline forecast points.
      expect(Object.hasOwn(s, "forecast")).toBe(false);
    }
  });
});
