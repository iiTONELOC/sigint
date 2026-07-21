// ── Correlation engine entry ────────────────────────────────────────
// Derives intelligence products from raw DataPoint[] + NewsArticle[].
//
// Three outputs:
//   1. IntelProduct[]  — correlated insights for the Intel Feed
//   2. ScoredAlert[]   — context-scored alerts for the Alert Log
//   3. RegionBaseline  — rolling event counts per country (persisted)
//
// NOT a provider — consumed synchronously from useMemo in DataContext.
// Recomputes when allData or news changes.

import type { DataPoint } from "@/features/base/dataPoints";
import type { NewsArticle } from "@/features/news";
import type {
  CorrelationResult,
  IntelProduct,
  RegionBaseline,
  ScoredAlert,
} from "./types";
import {
  CLUSTER_TIME_WINDOW,
  HOUR,
  getCountry,
  getTs,
} from "./shared";
import { accumulate, avgRate, recentCount } from "./baseline";
import { clusterByRegion, type Cluster } from "./clusters";
import {
  findCrossSourceCorrelations,
  type CrossCorrelation,
} from "./crossSource";
import { detectAnomalies } from "./anomalies";
import { linkNewsToEvents } from "./news";
import { detectCycloneRules } from "./cyclones";

export type {
  IntelProduct,
  ScoredAlert,
  RegionBaseline,
  CorrelationResult,
} from "./types";
export {
  initBaseline,
  loadBaseline,
  persistBaseline,
  emptyBaseline,
} from "./baseline";
export type CorrelationPolicy = Readonly<{
  recentWindowMs: number;
  sourcePreviewLimit: number;
  alertGroupPreviewLimit: number;
}>;

export const CORRELATION_POLICY: CorrelationPolicy = {
  recentWindowMs: 24 * HOUR,
  sourcePreviewLimit: 8,
  alertGroupPreviewLimit: 8,
};


// ── Intel product builder ───────────────────────────────────────────

function buildProducts(
  clusters: Cluster[],
  crossCorrelations: CrossCorrelation[],
  baseline: RegionBaseline,
  newsLinks: Map<string, NewsArticle[]>,
  cycloneProducts: IntelProduct[],
  now: number,
): IntelProduct[] {
  const products: IntelProduct[] = [];
  const consumedIds = new Set<string>();
  let idCounter = 0;

  // 0. Cyclone rules — highest specificity, attach first.
  for (const product of cycloneProducts) {
    products.push({
      ...product,
      sourceCount: product.sources.length,
      sources: product.sources.slice(
        0,
        CORRELATION_POLICY.sourcePreviewLimit,
      ),
    });
    for (const item of product.sources) consumedIds.add(item.id);
  }

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
      sources: allItems.slice(0, CORRELATION_POLICY.sourcePreviewLimit),
      sourceCount: allItems.length,
      newsLinks: news,
      timestamp: now,
    });
    for (const item of allItems) consumedIds.add(item.id);
  }

  // 2. Anomalies — baseline deviations
  for (const hit of detectAnomalies(baseline)) {
    const news = newsLinks.get(hit.country.toLowerCase());
    products.push({
      id: `ANOM-${++idCounter}`,
      type: "anomaly",
      priority: Math.min(9, 5 + Math.floor(hit.ratio)),
      title: `Activity spike in ${hit.country}`,
      summary: `${hit.last6h} events in 6h vs ${hit.expected6h.toFixed(1)} expected (${hit.ratio.toFixed(1)}× baseline)`,
      region: hit.country,
      sources: [],
      newsLinks: news,
      timestamp: now,
    });
  }

  // 3. Regional clusters — skip items already consumed
  for (const cluster of clusters) {
    const remaining = cluster.items.filter((i) => !consumedIds.has(i.id));
    if (remaining.length < 3) continue;
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
      priority: Math.min(8, 3 + Math.floor(remaining.length / 2)),
      title: `${remaining.length} ${typeLabel[cluster.type] ?? cluster.type} in ${cluster.country}`,
      summary: `Clustered activity within ${CLUSTER_TIME_WINDOW / HOUR}h window`,
      region: cluster.country,
      sources: remaining.slice(0, CORRELATION_POLICY.sourcePreviewLimit),
      sourceCount: remaining.length,
      newsLinks: news,
      timestamp: now,
    });
    for (const item of remaining) consumedIds.add(item.id);
  }

  // 4. News-linked regions
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

      if (sq === "7700" || sq === "7500") {
        score += 7;
        factors.push("Emergency/hijack squawk");
      } else if (sq === "7600") {
        score += 5;
        factors.push("Radio failure squawk");
      }

      if (isMil) {
        score += 2;
        factors.push("Military aircraft");
      }

      if (correlatedIds.has(item.id)) {
        score += 1;
        factors.push("Near conflict zone");
      }

      const reason =
        sq === "7700"
          ? "EMERGENCY"
          : sq === "7500"
            ? "HIJACK"
            : "RADIO FAILURE";
      const label = isMil
        ? `MIL SQUAWK ${sq} — ${reason}`
        : `SQUAWK ${sq} — ${reason}`;

      alerts.push({ item, label, score: Math.min(10, score), factors, count: 1 });
      continue;
    }

    if (item.type === "events") {
      const sev = (d.severity as number) ?? 0;
      if (sev < 3) continue;

      score += sev >= 5 ? 6 : sev >= 4 ? 4 : 3;
      factors.push(`Severity ${sev}/5`);

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
      alerts.push({ item, label, score: Math.min(10, score), factors, count: 1 });
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

      const win = baseline.countries[country];
      if (win) {
        const avg = avgRate(win);
        if (avg < 0.05 && mag >= 3) {
          score += 2;
          factors.push("Unusual seismic region");
        }
      }

      if (correlatedIds.has(item.id)) {
        score += 1;
        factors.push("Secondary effects detected");
      }

      const label = `M${mag.toFixed(1)} EARTHQUAKE${d.tsunami ? " — TSUNAMI" : ""}`;
      alerts.push({ item, label, score: Math.min(10, score), factors, count: 1 });
      continue;
    }

    if (item.type === "fires") {
      const frp = (d.frp as number) ?? 0;
      if (frp < 30) continue;

      score += frp >= 100 ? 5 : frp >= 50 ? 4 : 3;
      factors.push(`FRP ${frp.toFixed(0)} MW`);

      if (correlatedIds.has(item.id)) {
        score += 2;
        factors.push("Near conflict zone");
      }

      const label = `HIGH-INTENSITY FIRE — FRP ${frp.toFixed(0)} MW`;
      alerts.push({ item, label, score: Math.min(10, score), factors, count: 1 });
      continue;
    }

    if (item.type === "weather") {
      const sev = (d.severity as string) ?? "";
      if (sev !== "Extreme" && sev !== "Severe") continue;

      score += sev === "Extreme" ? 6 : 4;
      factors.push(`${sev} severity`);

      if (correlatedIds.has(item.id)) {
        score += 2;
        factors.push("Vessels in affected area");
      }

      const label = `${sev.toUpperCase()} — ${(d.event as string) || "WEATHER ALERT"}`;
      alerts.push({ item, label, score: Math.min(10, score), factors, count: 1 });
      continue;
    }
  }

  // Dedup: collapse same country + type within 2h sliding window.
  const DEDUP_WINDOW = 2 * HOUR;

  alerts.sort((a, b) => {
    const ka = `${a.item.type}:${getCountry(a.item).toLowerCase()}`;
    const kb = `${b.item.type}:${getCountry(b.item).toLowerCase()}`;
    if (ka !== kb) return ka < kb ? -1 : 1;
    return getTs(a.item) - getTs(b.item);
  });

  const deduped: ScoredAlert[] = [];
  let current: ScoredAlert | null = null;
  let currentKey = "";
  let currentTs = 0;

  for (const alert of alerts) {
    const country = getCountry(alert.item).toLowerCase().trim();
    const key = `${alert.item.type}:${country}`;
    const ts = getTs(alert.item);

    if (current && key === currentKey && ts - currentTs < DEDUP_WINDOW) {
      current.groupedItems = current.groupedItems ?? [current.item];
      if (
        current.groupedItems.length <
        CORRELATION_POLICY.alertGroupPreviewLimit
      ) {
        current.groupedItems.push(alert.item);
      }
      current.count += alert.count;

      if (alert.score > current.score) {
        current.item = alert.item;
        current.label = alert.label;
        current.score = alert.score;
        current.factors = alert.factors;
      }

      for (const f of alert.factors) {
        if (!current.factors.includes(f)) current.factors.push(f);
      }
    } else {
      if (current) deduped.push(current);
      current = { ...alert, groupedItems: [alert.item] };
      currentKey = key;
      currentTs = ts;
    }
  }
  if (current) deduped.push(current);

  for (const alert of deduped) {
    if (alert.count > 1) {
      alert.label = `${alert.label} (+${alert.count - 1} similar)`;
    }
  }

  deduped.sort((a, b) => b.score - a.score || getTs(b.item) - getTs(a.item));
  return deduped;
}

// ── Main public API ─────────────────────────────────────────────────

const intelTypes = new Set(["events", "quakes", "fires", "weather"]);

export function computeCorrelations(
  allData: DataPoint[],
  news: NewsArticle[],
  baselineIn?: RegionBaseline,
): CorrelationResult {
  const now = Date.now();
  const baseline = accumulate(allData, baselineIn);

  const recentCutoff = now - CORRELATION_POLICY.recentWindowMs;
  const recentItems = allData.filter((item) => {
    if (
      !intelTypes.has(item.type) &&
      item.type !== "aircraft" &&
      item.type !== "ships"
    )
      return false;
    return getTs(item) > recentCutoff;
  });

  const clusters = clusterByRegion(
    recentItems.filter((i) => intelTypes.has(i.type)),
  );
  const crossCorrelations = findCrossSourceCorrelations(recentItems);

  const anomalyHits = detectAnomalies(baseline);
  const newsLinks = linkNewsToEvents(clusters, anomalyHits, news);

  const cycloneProducts = detectCycloneRules(allData);

  const products = buildProducts(
    clusters,
    crossCorrelations,
    baseline,
    newsLinks,
    cycloneProducts,
    now,
  );
  const alerts = scoreAlerts(allData, baseline, crossCorrelations, now);

  return { products, alerts, baseline };
}
