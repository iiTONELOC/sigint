// ── Correlation Engine ───────────────────────────────────────────────
// Derives intelligence products from raw DataPoint[] + NewsArticle[].
//
// Three outputs:
//   1. IntelProduct[]  — correlated insights for the Intel Feed
//   2. ScoredAlert[]   — context-scored alerts for the Alert Log
//   3. RegionBaseline  — rolling event counts per country (persisted)
//
// Persisted to IndexedDB:
//   - Regional baselines (rolling 7-day window, survives reloads)
//   - User can clear via Settings
//
// NOT a provider — consumed synchronously from useMemo in each pane.
// Recomputes when allData changes.

import type { DataPoint } from "@/features/base/dataPoints";
import type { NewsArticle } from "@/panes/news-feed/newsProvider";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

// ── Types ────────────────────────────────────────────────────────────

/** A correlated intelligence product — not raw data, derived insight */
export type IntelProduct = {
  id: string;
  type: "cluster" | "cross-source" | "anomaly" | "trend" | "news-link";
  priority: number; // 1-10
  title: string;
  summary: string;
  region: string; // country or region name
  sources: DataPoint[]; // the underlying data points
  newsLinks?: NewsArticle[]; // related news articles
  timestamp: number; // when this product was generated
};

/** A context-scored alert (may represent a group of similar events) */
export type ScoredAlert = {
  item: DataPoint;
  label: string;
  score: number; // 1-10 composite score
  factors: string[]; // human-readable score factors
  /** Number of similar events collapsed into this alert (1 = single) */
  count: number;
  /** All items in the group (for watch mode cycling) */
  groupedItems?: DataPoint[];
};

/** Per-country rolling event counts */
type CountryWindow = {
  /** hourly bucket counts for last 7 days (168 buckets) */
  buckets: number[];
  /** timestamp of first bucket */
  bucketStart: number;
  /** total events in window */
  total: number;
};

export type RegionBaseline = {
  countries: Record<string, CountryWindow>;
  lastUpdated: number;
};

// ── Constants ────────────────────────────────────────────────────────

const HOUR = 3600_000;
const DAY = 86400_000;
const BASELINE_BUCKETS = 168; // 7 days × 24 hours
const CLUSTER_RADIUS_KM = 100;
const CLUSTER_TIME_WINDOW = 6 * HOUR;
const CROSS_SOURCE_RADIUS_KM = 75;
const CROSS_SOURCE_TIME_WINDOW = 12 * HOUR;

// ── Geo helpers ─────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const EARTH_R = 6371; // km

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCountry(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  if (item.type === "events")
    return (
      (d.sourceCountry as string) ||
      (d.locationName as string)?.split(",").pop()?.trim() ||
      "Unknown"
    );
  if (item.type === "aircraft") return (d.originCountry as string) || "Unknown";
  if (item.type === "quakes") {
    const loc = (d.location as string) || "";
    // USGS format: "X km SSE of Place, Country" — grab last segment
    const parts = loc.split(",");
    return parts.length > 1 ? parts[parts.length - 1]!.trim() : loc;
  }
  if (item.type === "weather") return "United States"; // NOAA is US-only
  if (item.type === "fires") return "Global"; // FIRMS doesn't include country
  return "Unknown";
}

function getTs(item: DataPoint): number {
  return item.timestamp ? new Date(item.timestamp).getTime() : Date.now();
}

// ── Regional baseline ───────────────────────────────────────────────

const BASELINE_KEY = CACHE_KEYS.intelBaseline;

function loadBaseline(): RegionBaseline {
  const cached = cacheGet<RegionBaseline>(BASELINE_KEY);
  if (cached && cached.countries && typeof cached.lastUpdated === "number") {
    return cached;
  }
  return { countries: {}, lastUpdated: 0 };
}

function persistBaseline(baseline: RegionBaseline): void {
  cacheSet(BASELINE_KEY, baseline);
}

function getBucketIndex(ts: number, bucketStart: number): number {
  return Math.floor((ts - bucketStart) / HOUR);
}

function ensureCountryWindow(
  baseline: RegionBaseline,
  country: string,
  now: number,
): CountryWindow {
  let win = baseline.countries[country];
  if (!win) {
    win = {
      buckets: new Array(BASELINE_BUCKETS).fill(0),
      bucketStart: now - BASELINE_BUCKETS * HOUR,
      total: 0,
    };
    baseline.countries[country] = win;
  }

  // Slide window forward if needed
  const age = now - win.bucketStart;
  const shift = Math.floor(age / HOUR) - BASELINE_BUCKETS;
  if (shift > 0) {
    if (shift >= BASELINE_BUCKETS) {
      win.buckets = new Array(BASELINE_BUCKETS).fill(0);
      win.bucketStart = now - BASELINE_BUCKETS * HOUR;
      win.total = 0;
    } else {
      // Shift out old buckets
      const removed = win.buckets.splice(0, shift);
      const removedSum = removed.reduce((a, b) => a + b, 0);
      win.total -= removedSum;
      for (let i = 0; i < shift; i++) win.buckets.push(0);
      win.bucketStart += shift * HOUR;
    }
  }

  return win;
}

function recordEvent(
  baseline: RegionBaseline,
  country: string,
  ts: number,
  now: number,
): void {
  if (country === "Unknown" || country === "Global") return;
  const win = ensureCountryWindow(baseline, country, now);
  const idx = getBucketIndex(ts, win.bucketStart);
  if (idx >= 0 && idx < BASELINE_BUCKETS) {
    win.buckets[idx]!++;
    win.total++;
  }
}

/** Average events per hour over the baseline window */
function avgRate(win: CountryWindow): number {
  // Use buckets from 24h+ ago to avoid counting current activity as "normal"
  const stableBuckets = win.buckets.slice(0, BASELINE_BUCKETS - 24);
  if (stableBuckets.length === 0) return 0;
  const sum = stableBuckets.reduce((a, b) => a + b, 0);
  return sum / stableBuckets.length;
}

/** Events in last N hours */
function recentCount(win: CountryWindow, hours: number): number {
  const start = Math.max(0, BASELINE_BUCKETS - hours);
  let sum = 0;
  for (let i = start; i < BASELINE_BUCKETS; i++) sum += win.buckets[i]!;
  return sum;
}

// ── Clustering ──────────────────────────────────────────────────────

type Cluster = {
  country: string;
  type: string;
  items: DataPoint[];
  centroidLat: number;
  centroidLon: number;
  maxSeverity: number;
};

function clusterByRegion(items: DataPoint[]): Cluster[] {
  const byCountryType = new Map<string, DataPoint[]>();

  for (const item of items) {
    const country = getCountry(item);
    const key = `${country}:${item.type}`;
    let group = byCountryType.get(key);
    if (!group) {
      group = [];
      byCountryType.set(key, group);
    }
    group.push(item);
  }

  const clusters: Cluster[] = [];

  for (const [key, group] of byCountryType) {
    if (group.length < 2) continue; // single events don't cluster

    const [country, type] = key.split(":");
    // Time-window filter — only events within CLUSTER_TIME_WINDOW of each other
    const now = Date.now();
    const recent = group.filter((g) => now - getTs(g) < CLUSTER_TIME_WINDOW);
    if (recent.length < 2) continue;

    let sumLat = 0,
      sumLon = 0,
      maxSev = 0;
    for (const item of recent) {
      sumLat += item.lat;
      sumLon += item.lon;
      const d = item.data as Record<string, unknown>;
      const sev =
        (d.severity as number) ??
        (d.magnitude as number) ??
        (d.frp as number) ??
        0;
      if (sev > maxSev) maxSev = sev;
    }

    clusters.push({
      country: country!,
      type: type!,
      items: recent,
      centroidLat: sumLat / recent.length,
      centroidLon: sumLon / recent.length,
      maxSeverity: maxSev,
    });
  }

  return clusters;
}

// ── Cross-source correlation ────────────────────────────────────────

type CrossCorrelation = {
  primary: DataPoint;
  correlated: DataPoint[];
  types: Set<string>;
  description: string;
};

// Simple grid index for spatial lookups — avoids O(n²)
const GRID_CELL_DEG = 2;
const GRID_COLS = 180;

function gridKey(lat: number, lon: number): number {
  const row = Math.max(0, Math.min(89, ((lat + 90) / GRID_CELL_DEG) | 0));
  const col = Math.max(0, Math.min(179, ((lon + 180) / GRID_CELL_DEG) | 0));
  return row * GRID_COLS + col;
}

function buildGrid(items: DataPoint[]): Map<number, DataPoint[]> {
  const grid = new Map<number, DataPoint[]>();
  for (const item of items) {
    const k = gridKey(item.lat, item.lon);
    const cell = grid.get(k);
    if (cell) cell.push(item);
    else grid.set(k, [item]);
  }
  return grid;
}

/** Query items within ~radiusKm using grid cells. radiusKm < 200 assumed. */
function gridQuery(
  grid: Map<number, DataPoint[]>,
  lat: number,
  lon: number,
  radiusDeg: number,
): DataPoint[] {
  const rMin = Math.max(0, ((lat - radiusDeg + 90) / GRID_CELL_DEG) | 0);
  const rMax = Math.min(89, ((lat + radiusDeg + 90) / GRID_CELL_DEG) | 0);
  const cMin = ((lon - radiusDeg + 180) / GRID_CELL_DEG) | 0;
  const cMax = ((lon + radiusDeg + 180) / GRID_CELL_DEG) | 0;
  const result: DataPoint[] = [];
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const cc = ((c % GRID_COLS) + GRID_COLS) % GRID_COLS;
      const cell = grid.get(r * GRID_COLS + cc);
      if (cell) {
        for (const item of cell) result.push(item);
      }
    }
  }
  return result;
}

// 75km ≈ 0.7° at equator, 200km ≈ 1.8° — use 2° query radius for safety
const QUERY_RADIUS_DEG = 2;
const MIL_QUERY_RADIUS_DEG = 2.5; // slightly wider for military aircraft

function findCrossSourceCorrelations(items: DataPoint[]): CrossCorrelation[] {
  const results: CrossCorrelation[] = [];
  const now = Date.now();

  // Index by type
  const byType = new Map<string, DataPoint[]>();
  for (const item of items) {
    let arr = byType.get(item.type);
    if (!arr) {
      arr = [];
      byType.set(item.type, arr);
    }
    arr.push(item);
  }

  const events = byType.get("events") ?? [];
  const fires = byType.get("fires") ?? [];
  const quakes = byType.get("quakes") ?? [];
  const weather = byType.get("weather") ?? [];
  const ships = byType.get("ships") ?? [];
  const aircraft = byType.get("aircraft") ?? [];

  // Build grids for the types we'll query against
  const fireGrid = fires.length > 0 ? buildGrid(fires) : null;
  const shipGrid = ships.length > 0 ? buildGrid(ships) : null;
  const eventGrid = events.length > 0 ? buildGrid(events) : null;

  // GDELT conflict + nearby fire
  if (fireGrid) {
    for (const evt of events) {
      const evtSev = ((evt.data as any).severity as number) ?? 0;
      if (evtSev < 3) continue;
      const evtTs = getTs(evt);
      if (now - evtTs > CROSS_SOURCE_TIME_WINDOW) continue;

      const candidates = gridQuery(
        fireGrid,
        evt.lat,
        evt.lon,
        QUERY_RADIUS_DEG,
      );
      const nearby = candidates.filter((f) => {
        const fTs = getTs(f);
        if (Math.abs(evtTs - fTs) > CROSS_SOURCE_TIME_WINDOW) return false;
        return (
          haversineKm(evt.lat, evt.lon, f.lat, f.lon) < CROSS_SOURCE_RADIUS_KM
        );
      });

      if (nearby.length > 0) {
        results.push({
          primary: evt,
          correlated: nearby,
          types: new Set(["events", "fires"]),
          description: `Conflict event with ${nearby.length} fire detection${nearby.length > 1 ? "s" : ""} within ${CROSS_SOURCE_RADIUS_KM}km`,
        });
      }
    }
  }

  // Earthquake + nearby fire
  if (fireGrid) {
    for (const eq of quakes) {
      const mag = ((eq.data as any).magnitude as number) ?? 0;
      if (mag < 4.5) continue;
      const eqTs = getTs(eq);
      if (now - eqTs > CROSS_SOURCE_TIME_WINDOW) continue;

      const candidates = gridQuery(fireGrid, eq.lat, eq.lon, QUERY_RADIUS_DEG);
      const nearby = candidates.filter((f) => {
        const fTs = getTs(f);
        if (fTs < eqTs) return false;
        if (fTs - eqTs > CROSS_SOURCE_TIME_WINDOW) return false;
        return (
          haversineKm(eq.lat, eq.lon, f.lat, f.lon) < CROSS_SOURCE_RADIUS_KM
        );
      });

      if (nearby.length > 0) {
        results.push({
          primary: eq,
          correlated: nearby,
          types: new Set(["quakes", "fires"]),
          description: `M${mag.toFixed(1)} earthquake with ${nearby.length} subsequent fire detection${nearby.length > 1 ? "s" : ""} nearby`,
        });
      }
    }
  }

  // Severe weather + ship density
  if (shipGrid) {
    for (const wx of weather) {
      const sev = (wx.data as any).severity as string;
      if (sev !== "Extreme" && sev !== "Severe") continue;

      const candidates = gridQuery(shipGrid, wx.lat, wx.lon, QUERY_RADIUS_DEG);
      const nearby = candidates.filter(
        (s) =>
          haversineKm(wx.lat, wx.lon, s.lat, s.lon) < CROSS_SOURCE_RADIUS_KM,
      );

      if (nearby.length >= 3) {
        results.push({
          primary: wx,
          correlated: nearby,
          types: new Set(["weather", "ships"]),
          description: `${sev} weather alert with ${nearby.length} vessels in affected area`,
        });
      }
    }
  }

  // Military aircraft in conflict zone
  if (eventGrid) {
    const milAircraft = aircraft.filter(
      (a) => (a.data as any).military === true,
    );
    for (const ac of milAircraft) {
      const candidates = gridQuery(
        eventGrid,
        ac.lat,
        ac.lon,
        MIL_QUERY_RADIUS_DEG,
      );
      const nearby = candidates.filter((evt) => {
        const evtSev = ((evt.data as any).severity as number) ?? 0;
        if (evtSev < 3) return false;
        return haversineKm(ac.lat, ac.lon, evt.lat, evt.lon) < 200;
      });

      if (nearby.length > 0) {
        results.push({
          primary: ac,
          correlated: nearby,
          types: new Set(["aircraft", "events"]),
          description: `Military aircraft operating near ${nearby.length} conflict event${nearby.length > 1 ? "s" : ""}`,
        });
      }
    }
  }

  return results;
}

// ── News linking ────────────────────────────────────────────────────

function linkNewsToEvents(
  clusters: Cluster[],
  anomalies: Array<{ country: string; type: string }>,
  news: NewsArticle[],
): Map<string, NewsArticle[]> {
  if (news.length === 0) return new Map();

  const links = new Map<string, NewsArticle[]>();

  // Build a set of active countries from clusters and anomalies
  const activeCountries = new Set<string>();
  for (const c of clusters) activeCountries.add(c.country.toLowerCase());
  for (const a of anomalies) activeCountries.add(a.country.toLowerCase());

  for (const article of news) {
    const text = `${article.title} ${article.description}`.toLowerCase();
    for (const country of activeCountries) {
      if (country.length < 3) continue; // skip abbreviations
      if (text.includes(country)) {
        let arr = links.get(country);
        if (!arr) {
          arr = [];
          links.set(country, arr);
        }
        if (arr.length < 3) arr.push(article); // cap at 3 per country
      }
    }
  }

  return links;
}

// ── Intel product builder ───────────────────────────────────────────

function buildProducts(
  clusters: Cluster[],
  crossCorrelations: CrossCorrelation[],
  baseline: RegionBaseline,
  newsLinks: Map<string, NewsArticle[]>,
  now: number,
): IntelProduct[] {
  const products: IntelProduct[] = [];
  let idCounter = 0;

  // 1. Cross-source correlations — highest value intel
  for (const cc of crossCorrelations) {
    const allItems = [cc.primary, ...cc.correlated];
    const country = getCountry(cc.primary);
    const news = newsLinks.get(country.toLowerCase());
    products.push({
      id: `XSRC-${++idCounter}`,
      type: "cross-source",
      priority: 8,
      title: cc.description,
      summary: `${cc.types.size} source types correlated in ${country}`,
      region: country,
      sources: allItems,
      newsLinks: news,
      timestamp: now,
    });
  }

  // 2. Anomalies — baseline deviations
  for (const [country, win] of Object.entries(baseline.countries)) {
    const avg = avgRate(win);
    if (avg < 0.1) continue; // not enough history
    const last6h = recentCount(win, 6);
    const expected6h = avg * 6;
    const ratio = expected6h > 0 ? last6h / expected6h : 0;

    if (ratio >= 3 && last6h >= 3) {
      const news = newsLinks.get(country.toLowerCase());
      products.push({
        id: `ANOM-${++idCounter}`,
        type: "anomaly",
        priority: Math.min(9, 5 + Math.floor(ratio)),
        title: `Activity spike in ${country}`,
        summary: `${last6h} events in 6h vs ${expected6h.toFixed(1)} expected (${ratio.toFixed(1)}× baseline)`,
        region: country,
        sources: [],
        newsLinks: news,
        timestamp: now,
      });
    }
  }

  // 3. Regional clusters
  for (const cluster of clusters) {
    if (cluster.items.length < 3) continue; // only significant clusters
    const news = newsLinks.get(cluster.country.toLowerCase());

    const typeLabel: Record<string, string> = {
      events: "conflict events",
      quakes: "seismic events",
      fires: "fire detections",
      weather: "weather alerts",
    };

    products.push({
      id: `CLST-${++idCounter}`,
      type: "cluster",
      priority: Math.min(8, 3 + Math.floor(cluster.items.length / 2)),
      title: `${cluster.items.length} ${typeLabel[cluster.type] ?? cluster.type} in ${cluster.country}`,
      summary: `Clustered activity within ${CLUSTER_TIME_WINDOW / HOUR}h window`,
      region: cluster.country,
      sources: cluster.items,
      newsLinks: news,
      timestamp: now,
    });
  }

  // 4. News-linked regions (only if no other product already covers this country)
  const coveredCountries = new Set(products.map((p) => p.region.toLowerCase()));
  for (const [country, articles] of newsLinks) {
    if (coveredCountries.has(country)) continue;
    if (articles.length < 1) continue;
    products.push({
      id: `NEWS-${++idCounter}`,
      type: "news-link",
      priority: 3,
      title: `News activity: ${country}`,
      summary: `${articles.length} news article${articles.length > 1 ? "s" : ""} mentioning active region`,
      region: country,
      sources: [],
      newsLinks: articles,
      timestamp: now,
    });
  }

  // Sort by priority desc, then by timestamp desc
  products.sort((a, b) => b.priority - a.priority || b.timestamp - a.timestamp);

  return products;
}

// ── Alert scorer ────────────────────────────────────────────────────

function scoreAlerts(
  allData: DataPoint[],
  baseline: RegionBaseline,
  crossCorrelations: CrossCorrelation[],
  now: number,
): ScoredAlert[] {
  const alerts: ScoredAlert[] = [];
  const cutoff = now - 24 * HOUR;

  // Build a set of correlated item IDs for boost
  const correlatedIds = new Set<string>();
  for (const cc of crossCorrelations) {
    correlatedIds.add(cc.primary.id);
    for (const c of cc.correlated) correlatedIds.add(c.id);
  }

  for (const item of allData) {
    const ts = getTs(item);
    if (ts < cutoff) continue;

    const d = item.data as Record<string, unknown>;
    const country = getCountry(item);
    const factors: string[] = [];
    let score = 0;

    if (item.type === "aircraft") {
      const sq = (d.squawk as string) ?? "";
      const isMil = d.military === true;
      if (!sq || (sq !== "7700" && sq !== "7600" && sq !== "7500")) continue;

      // Base score from squawk
      if (sq === "7700" || sq === "7500") {
        score += 7;
        factors.push("Emergency/hijack squawk");
      } else if (sq === "7600") {
        score += 5;
        factors.push("Radio failure squawk");
      }

      // Military boost
      if (isMil) {
        score += 2;
        factors.push("Military aircraft");
      }

      // Cross-source boost
      if (correlatedIds.has(item.id)) {
        score += 1;
        factors.push("Near conflict zone");
      }

      const label = isMil
        ? `MIL SQUAWK ${sq} — ${sq === "7700" ? "EMERGENCY" : sq === "7500" ? "HIJACK" : "RADIO FAILURE"}`
        : `SQUAWK ${sq} — ${sq === "7700" ? "EMERGENCY" : sq === "7500" ? "HIJACK" : "RADIO FAILURE"}`;

      alerts.push({
        item,
        label,
        score: Math.min(10, score),
        factors,
        count: 1,
      });
      continue;
    }

    if (item.type === "events") {
      const sev = (d.severity as number) ?? 0;
      if (sev < 3) continue;

      score += sev >= 5 ? 6 : sev >= 4 ? 4 : 3;
      factors.push(`Severity ${sev}/5`);

      // Baseline deviation boost
      const win = baseline.countries[country];
      if (win) {
        const avg = avgRate(win);
        const recent = recentCount(win, 6);
        const expected = avg * 6;
        if (expected > 0 && recent / expected >= 2) {
          score += 2;
          factors.push(
            `Region elevated (${(recent / expected).toFixed(1)}× baseline)`,
          );
        }
      }

      // Cross-source boost
      if (correlatedIds.has(item.id)) {
        score += 1;
        factors.push("Correlated with other source");
      }

      const label =
        sev >= 5
          ? "CRISIS EVENT"
          : sev >= 4
            ? "CONFLICT EVENT"
            : "TENSION EVENT";
      alerts.push({
        item,
        label,
        score: Math.min(10, score),
        factors,
        count: 1,
      });
      continue;
    }

    if (item.type === "quakes") {
      const mag = (d.magnitude as number) ?? 0;
      if (mag < 4.0) continue;

      score += mag >= 7 ? 8 : mag >= 6 ? 6 : mag >= 5 ? 4 : 3;
      factors.push(`M${mag.toFixed(1)}`);

      if (d.tsunami === true) {
        score += 2;
        factors.push("Tsunami alert");
      }

      // Unusual location boost
      const win = baseline.countries[country];
      if (win) {
        const avg = avgRate(win);
        if (avg < 0.05 && mag >= 3) {
          score += 2;
          factors.push("Unusual seismic region");
        }
      }

      // Cross-source boost
      if (correlatedIds.has(item.id)) {
        score += 1;
        factors.push("Secondary effects detected");
      }

      const label = `M${mag.toFixed(1)} EARTHQUAKE${d.tsunami ? " — TSUNAMI" : ""}`;
      alerts.push({
        item,
        label,
        score: Math.min(10, score),
        factors,
        count: 1,
      });
      continue;
    }

    if (item.type === "fires") {
      const frp = (d.frp as number) ?? 0;
      if (frp < 30) continue;

      score += frp >= 100 ? 5 : frp >= 50 ? 4 : 3;
      factors.push(`FRP ${frp.toFixed(0)} MW`);

      // Cross-source boost (conflict-related fire)
      if (correlatedIds.has(item.id)) {
        score += 2;
        factors.push("Near conflict zone");
      }

      const label = `HIGH-INTENSITY FIRE — FRP ${frp.toFixed(0)} MW`;
      alerts.push({
        item,
        label,
        score: Math.min(10, score),
        factors,
        count: 1,
      });
      continue;
    }

    if (item.type === "weather") {
      const sev = (d.severity as string) ?? "";
      if (sev !== "Extreme" && sev !== "Severe") continue;

      score += sev === "Extreme" ? 6 : 4;
      factors.push(`${sev} severity`);

      // Maritime risk boost
      if (correlatedIds.has(item.id)) {
        score += 2;
        factors.push("Vessels in affected area");
      }

      const label = `${sev.toUpperCase()} — ${(d.event as string) || "WEATHER ALERT"}`;
      alerts.push({
        item,
        label,
        score: Math.min(10, score),
        factors,
        count: 1,
      });
      continue;
    }
  }

  // ── Dedup: collapse same country + type within 1h into one alert ──
  const DEDUP_WINDOW = HOUR;
  const dedupMap = new Map<string, ScoredAlert>();

  for (const alert of alerts) {
    const country = getCountry(alert.item);
    const ts = getTs(alert.item);
    const hourBucket = Math.floor(ts / DEDUP_WINDOW);
    const key = `${alert.item.type}:${country}:${hourBucket}`;

    const existing = dedupMap.get(key);
    if (!existing) {
      alert.groupedItems = [alert.item];
      dedupMap.set(key, alert);
    } else {
      // Keep the higher-scored one as the representative
      existing.groupedItems = existing.groupedItems ?? [existing.item];
      existing.groupedItems.push(alert.item);
      existing.count = existing.groupedItems.length;

      if (alert.score > existing.score) {
        existing.item = alert.item;
        existing.label = alert.label;
        existing.score = alert.score;
        existing.factors = alert.factors;
      }

      // Merge unique factors
      for (const f of alert.factors) {
        if (!existing.factors.includes(f)) existing.factors.push(f);
      }
    }
  }

  const deduped = Array.from(dedupMap.values());

  // Update labels with count
  for (const alert of deduped) {
    if (alert.count > 1) {
      alert.label = `${alert.label} (+${alert.count - 1} similar)`;
    }
  }

  // Sort by score desc, then timestamp desc
  deduped.sort((a, b) => b.score - a.score || getTs(b.item) - getTs(a.item));

  return deduped;
}

// ── Main public API ─────────────────────────────────────────────────

export type CorrelationResult = {
  products: IntelProduct[];
  alerts: ScoredAlert[];
  baseline: RegionBaseline;
};

/**
 * Run the full correlation pipeline on current data.
 * Call from useMemo when allData or news changes.
 *
 * Updates the regional baseline in-place and persists to IndexedDB.
 * The baseline accumulates over time — it is NOT reset on data refresh.
 */
export function computeCorrelations(
  allData: DataPoint[],
  news: NewsArticle[],
): CorrelationResult {
  const now = Date.now();
  const baseline = loadBaseline();

  // ── Update baseline with current events ───────────────────────
  const intelTypes = new Set(["events", "quakes", "fires", "weather"]);
  for (const item of allData) {
    if (!intelTypes.has(item.type)) continue;
    const country = getCountry(item);
    const ts = getTs(item);
    recordEvent(baseline, country, ts, now);
  }
  baseline.lastUpdated = now;
  persistBaseline(baseline);

  // ── Filter to intel-relevant items (recent) ───────────────────
  const recentCutoff = now - 24 * HOUR;
  const recentItems = allData.filter((item) => {
    if (
      !intelTypes.has(item.type) &&
      item.type !== "aircraft" &&
      item.type !== "ships"
    )
      return false;
    const ts = getTs(item);
    return ts > recentCutoff;
  });

  // ── Run correlation stages ────────────────────────────────────
  const clusters = clusterByRegion(
    recentItems.filter((i) => intelTypes.has(i.type)),
  );
  const crossCorrelations = findCrossSourceCorrelations(recentItems);

  // ── News linking ──────────────────────────────────────────────
  const anomalyCountries: Array<{ country: string; type: string }> = [];
  for (const [country, win] of Object.entries(baseline.countries)) {
    const avg = avgRate(win);
    if (avg < 0.1) continue;
    const last6h = recentCount(win, 6);
    const expected6h = avg * 6;
    if (expected6h > 0 && last6h / expected6h >= 3 && last6h >= 3) {
      anomalyCountries.push({ country, type: "anomaly" });
    }
  }

  const newsLinks = linkNewsToEvents(clusters, anomalyCountries, news);

  // ── Build outputs ─────────────────────────────────────────────
  const products = buildProducts(
    clusters,
    crossCorrelations,
    baseline,
    newsLinks,
    now,
  );
  const alerts = scoreAlerts(allData, baseline, crossCorrelations, now);

  return { products, alerts, baseline };
}
