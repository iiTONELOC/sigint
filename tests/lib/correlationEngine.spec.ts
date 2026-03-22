import { describe, test, expect, beforeEach, mock } from "bun:test";
import type { DataPoint } from "@/features/base/dataPoints";
import type { NewsArticle } from "@/panes/news-feed/newsProvider";

// ── Mock storageService before importing correlationEngine ──────────
// The engine calls cacheGet/cacheSet for baseline persistence.

mock.module("@/lib/storageService", () => ({
  cacheGet: async () => null,
  cacheSet: async () => {},
  cacheInit: async () => {},
}));

const { computeCorrelations, initBaseline } =
  await import("@/lib/correlationEngine");

// ── Test data factories ─────────────────────────────────────────────

const HOUR = 3600_000;
let _idCounter = 0;

function makeEvent(overrides: Record<string, any> = {}): DataPoint {
  return {
    id: `evt-${++_idCounter}`,
    type: "events",
    lat: overrides.lat ?? 35.0,
    lon: overrides.lon ?? 45.0,
    timestamp: overrides.timestamp ?? new Date(Date.now() - HOUR).toISOString(),
    data: {
      severity: overrides.severity ?? 4,
      sourceCountry: overrides.country ?? "Iraq",
      locationName: overrides.locationName ?? "Baghdad, Iraq",
      ...(overrides.data ?? {}),
    },
  } as DataPoint;
}

function makeQuake(overrides: Record<string, any> = {}): DataPoint {
  return {
    id: `eq-${++_idCounter}`,
    type: "quakes",
    lat: overrides.lat ?? 35.7,
    lon: overrides.lon ?? 139.7,
    timestamp: overrides.timestamp ?? new Date(Date.now() - HOUR).toISOString(),
    data: {
      magnitude: overrides.magnitude ?? 5.2,
      location: overrides.location ?? "10 km SE of Tokyo, Japan",
      tsunami: overrides.tsunami ?? false,
      ...(overrides.data ?? {}),
    },
  } as DataPoint;
}

function makeFire(overrides: Record<string, any> = {}): DataPoint {
  return {
    id: `fire-${++_idCounter}`,
    type: "fires",
    lat: overrides.lat ?? 35.1,
    lon: overrides.lon ?? 45.1,
    timestamp: overrides.timestamp ?? new Date(Date.now() - HOUR).toISOString(),
    data: {
      frp: overrides.frp ?? 50,
      ...(overrides.data ?? {}),
    },
  } as DataPoint;
}

function makeAircraft(overrides: Record<string, any> = {}): DataPoint {
  return {
    id: `ac-${++_idCounter}`,
    type: "aircraft",
    lat: overrides.lat ?? 40.0,
    lon: overrides.lon ?? -74.0,
    timestamp:
      overrides.timestamp ?? new Date(Date.now() - 60_000).toISOString(),
    data: {
      squawk: overrides.squawk ?? "1200",
      military: overrides.military ?? false,
      originCountry: overrides.originCountry ?? "United States",
      callsign: overrides.callsign ?? "UAL123",
      ...(overrides.data ?? {}),
    },
  } as DataPoint;
}

function makeWeather(overrides: Record<string, any> = {}): DataPoint {
  return {
    id: `wx-${++_idCounter}`,
    type: "weather",
    lat: overrides.lat ?? 30.0,
    lon: overrides.lon ?? -90.0,
    timestamp: overrides.timestamp ?? new Date(Date.now() - HOUR).toISOString(),
    data: {
      severity: overrides.severity ?? "Severe",
      event: overrides.event ?? "Tornado Warning",
      ...(overrides.data ?? {}),
    },
  } as DataPoint;
}

function makeShip(overrides: Record<string, any> = {}): DataPoint {
  return {
    id: `ship-${++_idCounter}`,
    type: "ships",
    lat: overrides.lat ?? 30.0,
    lon: overrides.lon ?? -90.0,
    timestamp:
      overrides.timestamp ?? new Date(Date.now() - 60_000).toISOString(),
    data: {
      name: overrides.name ?? "VESSEL-1",
      ...(overrides.data ?? {}),
    },
  } as DataPoint;
}

function makeNews(overrides: Record<string, any> = {}): NewsArticle {
  return {
    id: `news-${++_idCounter}`,
    title: overrides.title ?? "Breaking News",
    url: overrides.url ?? "https://example.com",
    source: overrides.source ?? "Reuters",
    publishedAt: overrides.publishedAt ?? new Date().toISOString(),
    description: overrides.description ?? "News description",
  };
}

beforeEach(() => {
  _idCounter = 0;
});

// ── Basic pipeline ──────────────────────────────────────────────────

describe("computeCorrelations", () => {
  test("returns empty results for empty input", () => {
    const result = computeCorrelations([], []);
    expect(result.products).toEqual([]);
    expect(result.alerts).toEqual([]);
    expect(result.baseline).toBeDefined();
    expect(result.baseline.countries).toBeDefined();
  });

  test("returns CorrelationResult shape", () => {
    const result = computeCorrelations([makeEvent()], []);
    expect(result).toHaveProperty("products");
    expect(result).toHaveProperty("alerts");
    expect(result).toHaveProperty("baseline");
    expect(Array.isArray(result.products)).toBe(true);
    expect(Array.isArray(result.alerts)).toBe(true);
  });

  test("updates baseline lastUpdated", () => {
    const before = Date.now();
    const result = computeCorrelations([makeEvent()], []);
    expect(result.baseline.lastUpdated).toBeGreaterThanOrEqual(before);
  });
});

// ── Alert scoring ───────────────────────────────────────────────────

describe("alert scoring", () => {
  test("emergency squawk 7700 generates alert", () => {
    const ac = makeAircraft({ squawk: "7700" });
    const result = computeCorrelations([ac], []);
    expect(result.alerts.length).toBeGreaterThanOrEqual(1);
    const alert = result.alerts.find((a) => a.item.id === ac.id);
    expect(alert).toBeDefined();
    expect(alert!.label).toContain("EMERGENCY");
    expect(alert!.score).toBeGreaterThanOrEqual(7);
  });

  test("hijack squawk 7500 generates alert", () => {
    const ac = makeAircraft({ squawk: "7500" });
    const result = computeCorrelations([ac], []);
    const alert = result.alerts.find((a) => a.item.id === ac.id);
    expect(alert).toBeDefined();
    expect(alert!.label).toContain("HIJACK");
    expect(alert!.score).toBeGreaterThanOrEqual(7);
  });

  test("radio failure squawk 7600 generates alert with lower score", () => {
    const ac = makeAircraft({ squawk: "7600" });
    const result = computeCorrelations([ac], []);
    const alert = result.alerts.find((a) => a.item.id === ac.id);
    expect(alert).toBeDefined();
    expect(alert!.label).toContain("RADIO FAILURE");
    expect(alert!.score).toBeGreaterThanOrEqual(5);
    expect(alert!.score).toBeLessThan(8);
  });

  test("normal squawk does NOT generate alert", () => {
    const ac = makeAircraft({ squawk: "1200" });
    const result = computeCorrelations([ac], []);
    const alert = result.alerts.find((a) => a.item.id === ac.id);
    expect(alert).toBeUndefined();
  });

  test("military aircraft with emergency squawk gets score boost", () => {
    const civ = makeAircraft({
      squawk: "7700",
      military: false,
      originCountry: "France",
    });
    const mil = makeAircraft({
      squawk: "7700",
      military: true,
      originCountry: "Germany",
    });
    const result = computeCorrelations([civ, mil], []);
    const civAlert = result.alerts.find(
      (a) =>
        a.item.id === civ.id ||
        a.groupedItems?.some((g: any) => g.id === civ.id),
    );
    const milAlert = result.alerts.find(
      (a) =>
        a.item.id === mil.id ||
        a.groupedItems?.some((g: any) => g.id === mil.id),
    );
    expect(civAlert).toBeDefined();
    expect(milAlert).toBeDefined();
    expect(milAlert!.score).toBeGreaterThan(civAlert!.score);
    expect(milAlert!.factors).toContain("Military aircraft");
  });

  test("high-severity event generates alert", () => {
    const evt = makeEvent({ severity: 5 });
    const result = computeCorrelations([evt], []);
    const alert = result.alerts.find((a) => a.item.id === evt.id);
    expect(alert).toBeDefined();
    expect(alert!.label).toContain("CRISIS");
    expect(alert!.score).toBeGreaterThanOrEqual(6);
  });

  test("low-severity event does NOT generate alert", () => {
    const evt = makeEvent({ severity: 2 });
    const result = computeCorrelations([evt], []);
    const alert = result.alerts.find((a) => a.item.id === evt.id);
    expect(alert).toBeUndefined();
  });

  test("large earthquake generates alert", () => {
    const eq = makeQuake({ magnitude: 6.5 });
    const result = computeCorrelations([eq], []);
    const alert = result.alerts.find((a) => a.item.id === eq.id);
    expect(alert).toBeDefined();
    expect(alert!.label).toContain("M6.5");
    expect(alert!.score).toBeGreaterThanOrEqual(6);
  });

  test("earthquake with tsunami gets score boost", () => {
    const noTsu = makeQuake({
      magnitude: 6.0,
      tsunami: false,
      location: "10 km SE of Lima, Peru",
    });
    const tsu = makeQuake({
      magnitude: 6.0,
      tsunami: true,
      location: "10 km SE of Tokyo, Japan",
    });
    const result = computeCorrelations([noTsu, tsu], []);
    const noTsuAlert = result.alerts.find(
      (a) =>
        a.item.id === noTsu.id ||
        a.groupedItems?.some((g: any) => g.id === noTsu.id),
    );
    const tsuAlert = result.alerts.find(
      (a) =>
        a.item.id === tsu.id ||
        a.groupedItems?.some((g: any) => g.id === tsu.id),
    );
    expect(noTsuAlert).toBeDefined();
    expect(tsuAlert).toBeDefined();
    expect(tsuAlert!.score).toBeGreaterThan(noTsuAlert!.score);
    expect(tsuAlert!.label).toContain("TSUNAMI");
  });

  test("small earthquake does NOT generate alert", () => {
    const eq = makeQuake({ magnitude: 3.0 });
    const result = computeCorrelations([eq], []);
    const alert = result.alerts.find((a) => a.item.id === eq.id);
    expect(alert).toBeUndefined();
  });

  test("high FRP fire generates alert", () => {
    const fire = makeFire({ frp: 100 });
    const result = computeCorrelations([fire], []);
    const alert = result.alerts.find((a) => a.item.id === fire.id);
    expect(alert).toBeDefined();
    expect(alert!.label).toContain("FIRE");
    expect(alert!.score).toBeGreaterThanOrEqual(5);
  });

  test("low FRP fire does NOT generate alert", () => {
    const fire = makeFire({ frp: 10 });
    const result = computeCorrelations([fire], []);
    const alert = result.alerts.find((a) => a.item.id === fire.id);
    expect(alert).toBeUndefined();
  });

  test("extreme weather generates alert", () => {
    const wx = makeWeather({ severity: "Extreme", event: "Tornado" });
    const result = computeCorrelations([wx], []);
    const alert = result.alerts.find((a) => a.item.id === wx.id);
    expect(alert).toBeDefined();
    expect(alert!.score).toBeGreaterThanOrEqual(6);
  });

  test("moderate weather does NOT generate alert", () => {
    const wx = makeWeather({ severity: "Minor" });
    const result = computeCorrelations([wx], []);
    const alert = result.alerts.find((a) => a.item.id === wx.id);
    expect(alert).toBeUndefined();
  });

  test("alerts are sorted by score descending", () => {
    const data = [
      makeQuake({ magnitude: 7.5 }),
      makeQuake({ magnitude: 4.5 }),
      makeAircraft({ squawk: "7700" }),
      makeEvent({ severity: 5 }),
    ];
    const result = computeCorrelations(data, []);
    for (let i = 1; i < result.alerts.length; i++) {
      expect(result.alerts[i]!.score).toBeLessThanOrEqual(
        result.alerts[i - 1]!.score,
      );
    }
  });

  test("alerts score capped at 10", () => {
    const ac = makeAircraft({ squawk: "7700", military: true });
    const result = computeCorrelations([ac], []);
    for (const alert of result.alerts) {
      expect(alert.score).toBeLessThanOrEqual(10);
    }
  });

  test("old data (>24h) does NOT generate alerts", () => {
    const old = makeEvent({
      severity: 5,
      timestamp: new Date(Date.now() - 25 * HOUR).toISOString(),
    });
    const result = computeCorrelations([old], []);
    expect(result.alerts.length).toBe(0);
  });
});

// ── Alert deduplication ─────────────────────────────────────────────

describe("alert deduplication", () => {
  test("similar events in same country within 2h are collapsed", () => {
    const now = Date.now();
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvent({
        severity: 4,
        country: "Iraq",
        timestamp: new Date(now - i * 30 * 60_000).toISOString(), // 30min apart
      }),
    );
    const result = computeCorrelations(events, []);
    // Should collapse into fewer alerts than 5
    const iraqAlerts = result.alerts.filter(
      (a) => a.label.includes("CONFLICT") || a.label.includes("CRISIS"),
    );
    expect(iraqAlerts.length).toBeLessThan(5);
    // Collapsed alert should have count > 1
    const collapsed = iraqAlerts.find((a) => a.count > 1);
    expect(collapsed).toBeDefined();
    expect(collapsed!.label).toContain("similar");
  });

  test("events in different countries are NOT collapsed", () => {
    const now = Date.now();
    const e1 = makeEvent({
      severity: 4,
      country: "Iraq",
      timestamp: new Date(now - HOUR).toISOString(),
    });
    const e2 = makeEvent({
      severity: 4,
      country: "Syria",
      timestamp: new Date(now - HOUR).toISOString(),
    });
    const result = computeCorrelations([e1, e2], []);
    // Each should be its own alert
    expect(result.alerts.length).toBe(2);
  });
});

// ── Cross-source correlation ────────────────────────────────────────

describe("cross-source correlation", () => {
  test("conflict event near fire produces cross-source product", () => {
    const evt = makeEvent({ lat: 35.0, lon: 45.0, severity: 4 });
    const fire = makeFire({ lat: 35.05, lon: 45.05 }); // ~7km away
    const result = computeCorrelations([evt, fire], []);
    const xsrc = result.products.filter((p) => p.type === "cross-source");
    expect(xsrc.length).toBeGreaterThanOrEqual(1);
    expect(xsrc[0]!.title).toContain("fire");
  });

  test("distant event and fire do NOT correlate", () => {
    const evt = makeEvent({ lat: 35.0, lon: 45.0, severity: 4 });
    const fire = makeFire({ lat: 10.0, lon: 10.0 }); // thousands of km away
    const result = computeCorrelations([evt, fire], []);
    const xsrc = result.products.filter((p) => p.type === "cross-source");
    expect(xsrc.length).toBe(0);
  });

  test("large earthquake near fire produces cross-source product", () => {
    const eq = makeQuake({ lat: 35.0, lon: 45.0, magnitude: 6.0 });
    // Fire AFTER the earthquake, nearby
    const fire = makeFire({
      lat: 35.05,
      lon: 45.05,
      timestamp: new Date(Date.now() - 30 * 60_000).toISOString(),
    });
    const result = computeCorrelations([eq, fire], []);
    const xsrc = result.products.filter((p) => p.type === "cross-source");
    expect(xsrc.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Intel products ──────────────────────────────────────────────────

describe("intel products", () => {
  test("products are sorted by priority descending", () => {
    const data = [
      makeEvent({ severity: 5, country: "Iraq" }),
      makeEvent({ severity: 4, country: "Iraq" }),
      makeEvent({ severity: 4, country: "Iraq" }),
      makeFire({ lat: 35.0, lon: 45.0 }),
    ];
    const result = computeCorrelations(data, []);
    for (let i = 1; i < result.products.length; i++) {
      expect(result.products[i]!.priority).toBeLessThanOrEqual(
        result.products[i - 1]!.priority,
      );
    }
  });

  test("cross-source products have priority 8", () => {
    const evt = makeEvent({ lat: 35.0, lon: 45.0, severity: 4 });
    const fire = makeFire({ lat: 35.05, lon: 45.05 });
    const result = computeCorrelations([evt, fire], []);
    const xsrc = result.products.filter((p) => p.type === "cross-source");
    for (const p of xsrc) {
      expect(p.priority).toBe(8);
    }
  });

  test("product IDs are unique", () => {
    const data = [
      makeEvent({ severity: 5, country: "Iraq" }),
      makeEvent({ severity: 4, country: "Iraq" }),
      makeEvent({ severity: 4, country: "Syria" }),
      makeQuake({ magnitude: 6.0 }),
      makeFire({ lat: 35.0, lon: 45.0, frp: 80 }),
    ];
    const result = computeCorrelations(data, []);
    const ids = result.products.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("news articles link to matching country products", () => {
    const evt = makeEvent({ severity: 4, country: "Iraq" });
    const evt2 = makeEvent({ severity: 4, country: "Iraq" });
    const evt3 = makeEvent({ severity: 4, country: "Iraq" });
    const news = [
      makeNews({
        title: "Fighting intensifies in Iraq",
        description: "Iraq conflict escalates",
      }),
    ];
    const result = computeCorrelations([evt, evt2, evt3], news);
    const iraqProducts = result.products.filter((p) => p.region === "Iraq");
    const withNews = iraqProducts.filter(
      (p) => p.newsLinks && p.newsLinks.length > 0,
    );
    expect(withNews.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Baseline ────────────────────────────────────────────────────────

describe("baseline tracking", () => {
  test("baseline records events by country", () => {
    const events = [
      makeEvent({ country: "Iraq" }),
      makeEvent({ country: "Iraq" }),
      makeEvent({ country: "Syria" }),
    ];
    const result = computeCorrelations(events, []);
    expect(result.baseline.countries["Iraq"]).toBeDefined();
    expect(result.baseline.countries["Syria"]).toBeDefined();
  });

  test("Unknown and Global countries are not tracked", () => {
    const fire = makeFire(); // fires return "Global"
    const result = computeCorrelations([fire], []);
    expect(result.baseline.countries["Global"]).toBeUndefined();
    expect(result.baseline.countries["Unknown"]).toBeUndefined();
  });

  test("baseline country window has 168 buckets", () => {
    const evt = makeEvent({ country: "TestCountry" });
    const result = computeCorrelations([evt], []);
    const win = result.baseline.countries["TestCountry"];
    expect(win).toBeDefined();
    expect(win!.buckets.length).toBe(168);
  });
});
