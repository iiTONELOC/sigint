import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "bun:test";
import { resolve } from "path";
import {
  computeAdvisoryHash,
  fetchCyclones,
  getCyclonesCache,
  __resetCyclonesCacheForTests,
} from "../../../../src/server/api/cyclonesCache";
import {
  parseTrackKml,
  enrichStorms,
} from "../../../../src/server/api/cyclonesForecastTrack";
import { __resetCycloneConeCacheForTests } from "../../../../src/server/api/cyclonesConeCache";
import {
  getCycloneDossier,
  parseProductHtml,
  __resetCycloneDossierCacheForTests,
} from "../../../../src/server/api/cyclonesDossierCache";
import { unzipSingleEntryKmz } from "../../../../src/server/api/zipReader";
import {
  synthesizeForecastPoints,
  __resetForecastSynthesisForTests,
} from "@/features/environmental/cyclones/data/synthesizeForecastPoints";

// ── Real-data cyclone suite ──────────────────────────────────────────
// Built ENTIRELY on bytes captured once from live NHC (EP01 2026, Amanda)
// under tests/fixtures/cyclones-real/. No network. These assert the REAL
// data contract the fabricated fixtures got wrong:
//   - CurrentStorms.json has NO inline forecast — it lives in TRACK.kmz
//   - advisory number is publicAdvisory.advNum (not forecastTrack.advisoryNumber)
//   - the cone is a real multi-hundred-vertex polygon from CONE.kmz
// Every test here was RED before the fix (forecast: [], frozen hash) and is
// GREEN only with the server-side enrichment + advNum hash in place.

const REAL = resolve(import.meta.dir, "../../../fixtures/cyclones-real");

async function realText(name: string): Promise<string> {
  return Bun.file(resolve(REAL, name)).text();
}
async function realBytes(name: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(resolve(REAL, name)).arrayBuffer());
}

// ── TRACK.kmz → forecast points ─────────────────────────────────────

describe("parseTrackKml — real TRACK.kmz", () => {
  test("extracts the forecast Point placemarks (not the LineStrings)", async () => {
    const kml = await unzipSingleEntryKmz(await realBytes("ep012026-track.kmz"));
    const pts = parseTrackKml(kml);
    // Amanda adv 8: 12/24/36/48/60/72/96/120h forecast points (8 total;
    // the initial eye position is excluded — it is not a forecast).
    expect(pts.length).toBe(8);
    expect(pts[0]!.fcstHour).toBe(12);
    expect(pts[pts.length - 1]!.fcstHour).toBe(120);
    // strictly increasing forecast hours
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.fcstHour).toBeGreaterThan(pts[i - 1]!.fcstHour);
    }
  });

  test("each point has finite lat/lon, a wind, and a valid-time label", async () => {
    const kml = await unzipSingleEntryKmz(await realBytes("ep012026-track.kmz"));
    for (const p of parseTrackKml(kml)) {
      expect(Number.isFinite(p.latitude)).toBe(true);
      expect(Number.isFinite(p.longitude)).toBe(true);
      expect(p.maxWind).toBeGreaterThan(0);
      expect(p.validTime.length).toBeGreaterThan(0);
    }
  });
});

// ── Advisory hash — the refresh-freeze fix ──────────────────────────

describe("computeAdvisoryHash — real shape (advNum)", () => {
  test("reads publicAdvisory.advNum and changes when a new advisory arrives", async () => {
    const cs = JSON.parse(await realText("CurrentStorms.json")) as {
      activeStorms: Record<string, unknown>[];
    };
    const h8 = computeAdvisoryHash(cs.activeStorms);
    expect(h8).toContain("008"); // real adv number is on publicAdvisory.advNum

    const next = JSON.parse(JSON.stringify(cs)) as typeof cs;
    (next.activeStorms[0]!.publicAdvisory as { advNum: string }).advNum = "009";
    const h9 = computeAdvisoryHash(next.activeStorms);
    expect(h9).not.toBe(h8); // not frozen — a new advisory refreshes
  });
});

// ── Full server enrichment chain (replay real bytes, no network) ────

describe("fetchCyclones — server enriches forecast + cone before cache write", () => {
  let realFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    realFetch = globalThis.fetch;
    const cs = await realText("CurrentStorms.json");
    const track = await Bun.file(resolve(REAL, "ep012026-track.kmz")).arrayBuffer();
    const cone = await Bun.file(resolve(REAL, "ep012026-cone.kmz")).arrayBuffer();
    globalThis.fetch = (async (input: string | URL | Request) => {
      const u = typeof input === "string" ? input : input.toString();
      if (u.includes("CurrentStorms.json")) return new Response(cs, { status: 200 });
      if (u.includes("TRACK.kmz")) return new Response(track, { status: 200 });
      if (u.includes("CONE.kmz")) return new Response(cone, { status: 200 });
      throw new Error("unexpected fetch in test: " + u);
    }) as unknown as typeof fetch;
    __resetCyclonesCacheForTests();
    __resetCycloneConeCacheForTests();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("cached storm carries 8 forecast points + a real multi-hundred-vertex cone", async () => {
    await fetchCyclones(new Date(Date.UTC(2026, 5, 4)));
    const body = getCyclonesCache().body as { activeStorms: any[] } | null;
    const s = body?.activeStorms?.[0];
    expect(s).toBeDefined();
    expect(s.forecast.length).toBe(8);
    expect(s.forecast[0].fcstHour).toBe(12);
    expect(s.officialCone.type).toBe("Polygon");
    expect(s.officialCone.coordinates[0].length).toBeGreaterThan(300);
  });
});

// ── enrichStorms is non-fatal when products fail ────────────────────

describe("enrichStorms — degrades gracefully", () => {
  let realFetch: typeof globalThis.fetch;
  beforeEach(() => {
    realFetch = globalThis.fetch;
    __resetCycloneConeCacheForTests();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("a storm with no product URLs gets forecast: [] and still survives", async () => {
    globalThis.fetch = (async () => {
      throw new Error("no network");
    }) as unknown as typeof fetch;
    const storms: any[] = [{ id: "ep012026" }];
    await enrichStorms(storms);
    expect(Array.isArray(storms[0].forecast)).toBe(true);
    expect(storms[0].forecast.length).toBe(0);
  });
});

// ── Dossier text products: parse + survive a sweep (#4) ─────────────

describe("cyclone dossier — real text products", () => {
  test("parseProductHtml extracts a real advisory + discussion body", async () => {
    const adv = parseProductHtml(await realText("ep012026-public.html"), "advisory");
    const dis = parseProductHtml(
      await realText("ep012026-discussion.html"),
      "discussion",
    );
    expect(adv?.body.length ?? 0).toBeGreaterThan(500);
    expect(adv?.advisoryNumber).toBe("8");
    expect(dis?.body.length ?? 0).toBeGreaterThan(500);
  });

  describe("getCycloneDossier survives a transient NHC outage + a sweep", () => {
    let realFetch: typeof globalThis.fetch;
    let textUp = true;

    beforeEach(async () => {
      realFetch = globalThis.fetch;
      const cs = await realText("CurrentStorms.json");
      const track = await Bun.file(resolve(REAL, "ep012026-track.kmz")).arrayBuffer();
      const cone = await Bun.file(resolve(REAL, "ep012026-cone.kmz")).arrayBuffer();
      const adv = await realText("ep012026-public.html");
      const dis = await realText("ep012026-discussion.html");
      const wnd = await realText("ep012026-windprobs.html");
      textUp = true;
      globalThis.fetch = (async (input: string | URL | Request) => {
        const u = typeof input === "string" ? input : input.toString();
        if (u.includes("CurrentStorms.json")) return new Response(cs, { status: 200 });
        if (u.includes("TRACK.kmz")) return new Response(track, { status: 200 });
        if (u.includes("CONE.kmz")) return new Response(cone, { status: 200 });
        if (u.includes("MIATCPEP1")) return textUp ? new Response(adv) : new Response("", { status: 503 });
        if (u.includes("MIATCDEP1")) return textUp ? new Response(dis) : new Response("", { status: 503 });
        if (u.includes("MIAPWSEP1")) return textUp ? new Response(wnd) : new Response("", { status: 503 });
        throw new Error("unexpected fetch in test: " + u);
      }) as unknown as typeof fetch;
      __resetCyclonesCacheForTests();
      __resetCycloneConeCacheForTests();
      __resetCycloneDossierCacheForTests();
      // Prime the per-storm product URL stash via a real poll.
      await fetchCyclones(new Date(Date.UTC(2026, 5, 4)));
    });

    afterEach(() => {
      globalThis.fetch = realFetch;
    });

    test("outage → no empty bundle cached; recovery → text returns; sweep → text survives", async () => {
      // Transient outage: every product 503 → must NOT cache a hollow bundle.
      textUp = false;
      const down = await getCycloneDossier("EP012026");
      expect(down.dossier).toBeNull();

      // Recovery: the next request fetches the real bodies (no 60-min poison).
      textUp = true;
      const up = await getCycloneDossier("EP012026");
      expect(up.dossier?.advisory?.body.length ?? 0).toBeGreaterThan(500);

      // A provider sweep must not clobber the now-cached text.
      await fetchCyclones(new Date(Date.UTC(2026, 5, 4)));
      const after = await getCycloneDossier("EP012026");
      expect(after.dossier?.advisory?.body.length ?? 0).toBeGreaterThan(500);
    });
  });
});

// ── Identity stability (responsiveness) ─────────────────────────────

describe("synthesizeForecastPoints — identity stability", () => {
  beforeEach(() => __resetForecastSynthesisForTests());

  function storm(advNum: string) {
    return {
      id: "CYEP012026",
      type: "cyclones" as const,
      lat: 12.5,
      lon: -130.5,
      timestamp: "t",
      data: {
        stormId: "EP012026",
        name: "Amanda",
        basin: "EP",
        classification: "TS",
        saffirSimpson: 0,
        maxWindKt: 35,
        advisoryNumber: advNum,
        lastUpdate: "t",
        forecast: [
          { fcstHour: 12, validTime: "v", lat: 13, lon: -131.5, maxWindKt: 40, category: "TS", errorRadiusNm: 26 },
        ],
      },
    };
  }

  test("unchanged content returns the SAME array and SAME object references", () => {
    const a = synthesizeForecastPoints([storm("008") as any]);
    const b = synthesizeForecastPoints([storm("008") as any]);
    expect(a).toBe(b);
    expect(a[0]).toBe(b[0]);
    expect(a.length).toBe(1);
  });

  test("a new advisory produces fresh references (so the render updates)", () => {
    const a = synthesizeForecastPoints([storm("008") as any]);
    const c = synthesizeForecastPoints([storm("009") as any]);
    expect(a).not.toBe(c);
    expect(a[0]).not.toBe(c[0]);
  });

  test("forecast points carry parentStormId so they resolve to their storm", () => {
    const a = synthesizeForecastPoints([storm("008") as any]);
    expect(a[0]!.type).toBe("cyclones-forecast");
    expect((a[0]!.data as { parentStormId: string }).parentStormId).toBe("EP012026");
    // resolver key alignment: `CY${parentStormId}` === storm DataPoint id
    expect(`CY${(a[0]!.data as { parentStormId: string }).parentStormId}`).toBe(
      "CYEP012026",
    );
  });
});
