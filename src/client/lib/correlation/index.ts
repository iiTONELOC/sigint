import { Domain } from "@shared/domain/identity";
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
import { SquawkCode } from "@shared/domain/aircraft";
import { isEnumValue } from "@shared/types/enum";
import { bandValue, type Band } from "@shared/types/bands";
import { IntelProductType } from "@shared/domain/correlation";
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


// ── Intel product builder ─────────────────────────────────

const CROSS_SOURCE_PRIORITY = 8;
const NEWS_LINK_PRIORITY = 3;
const ANOMALY_BASE_PRIORITY = 5;
const MAX_ANOMALY_PRIORITY = 9;
const CLUSTER_BASE_PRIORITY = 3;
const MAX_CLUSTER_PRIORITY = 8;
const MIN_CLUSTER_ITEMS = 3;
const CLUSTER_PRIORITY_DIVISOR = 2;
const MIN_NEWS_ARTICLES = 1;

const CLUSTER_TYPE_LABELS: Readonly<Record<string, string>> = {
  events: "conflict events",
  quakes: "seismic events",
  fires: "fire detections",
  weather: "weather alerts",
};

type ProductScope = Readonly<{
  newsLinks: Map<string, NewsArticle[]>;
  consumedIds: Set<string>;
  now: number;
}>;

function newsFor(
  scope: ProductScope,
  region: string,
): NewsArticle[] | undefined {
  return scope.newsLinks.get(region.toLowerCase());
}

function cycloneProductsOf(
  cycloneProducts: IntelProduct[],
  scope: ProductScope,
): IntelProduct[] {
  return cycloneProducts.map((product) => {
    for (const item of product.sources) scope.consumedIds.add(item.id);
    return {
      ...product,
      sourceCount: product.sources.length,
      sources: product.sources.slice(0, CORRELATION_POLICY.sourcePreviewLimit),
    };
  });
}

function crossSourceProductsOf(
  crossCorrelations: CrossCorrelation[],
  scope: ProductScope,
): IntelProduct[] {
  return crossCorrelations.map((correlation, index) => {
    const allItems = [correlation.primary, ...correlation.correlated];
    const country = getCountry(correlation.primary);
    for (const item of allItems) scope.consumedIds.add(item.id);
    return {
      id: `XSRC-${index + 1}`,
      type: IntelProductType.CrossSource,
      priority: CROSS_SOURCE_PRIORITY,
      title: correlation.description,
      summary: `${correlation.types.size} source types correlated in ${country}`,
      region: country,
      sources: allItems.slice(0, CORRELATION_POLICY.sourcePreviewLimit),
      sourceCount: allItems.length,
      newsLinks: newsFor(scope, country),
      timestamp: scope.now,
    };
  });
}

function anomalyProductsOf(
  baseline: RegionBaseline,
  scope: ProductScope,
): IntelProduct[] {
  return detectAnomalies(baseline).map((hit, index) => ({
    id: `ANOM-${index + 1}`,
    type: IntelProductType.Anomaly,
    priority: Math.min(
      MAX_ANOMALY_PRIORITY,
      ANOMALY_BASE_PRIORITY + Math.floor(hit.ratio),
    ),
    title: `Activity spike in ${hit.country}`,
    summary: `${hit.last6h} events in 6h vs ${hit.expected6h.toFixed(1)} expected (${hit.ratio.toFixed(1)}\u00d7 baseline)`,
    region: hit.country,
    sources: [],
    newsLinks: newsFor(scope, hit.country),
    timestamp: scope.now,
  }));
}

function clusterProductsOf(
  clusters: Cluster[],
  scope: ProductScope,
): IntelProduct[] {
  const products: IntelProduct[] = [];

  for (const cluster of clusters) {
    const remaining = cluster.items.filter(
      (item) => !scope.consumedIds.has(item.id),
    );
    if (remaining.length < MIN_CLUSTER_ITEMS) continue;

    const label = CLUSTER_TYPE_LABELS[cluster.type] ?? cluster.type;
    products.push({
      id: `CLST-${products.length + 1}`,
      type: IntelProductType.Cluster,
      priority: Math.min(
        MAX_CLUSTER_PRIORITY,
        CLUSTER_BASE_PRIORITY +
          Math.floor(remaining.length / CLUSTER_PRIORITY_DIVISOR),
      ),
      title: `${remaining.length} ${label} in ${cluster.country}`,
      summary: `Clustered activity within ${CLUSTER_TIME_WINDOW / HOUR}h window`,
      region: cluster.country,
      sources: remaining.slice(0, CORRELATION_POLICY.sourcePreviewLimit),
      sourceCount: remaining.length,
      newsLinks: newsFor(scope, cluster.country),
      timestamp: scope.now,
    });
    for (const item of remaining) scope.consumedIds.add(item.id);
  }
  return products;
}

function newsProductsOf(
  covered: ReadonlySet<string>,
  scope: ProductScope,
): IntelProduct[] {
  const products: IntelProduct[] = [];

  for (const [country, articles] of scope.newsLinks) {
    if (covered.has(country)) continue;
    if (articles.length < MIN_NEWS_ARTICLES) continue;
    const plural = articles.length > 1 ? "s" : "";
    products.push({
      id: `NEWS-${products.length + 1}`,
      type: IntelProductType.NewsLink,
      priority: NEWS_LINK_PRIORITY,
      title: `News activity: ${country}`,
      summary: `${articles.length} news article${plural} mentioning active region`,
      region: country,
      sources: [],
      newsLinks: articles,
      timestamp: scope.now,
    });
  }
  return products;
}

function buildProducts(
  clusters: Cluster[],
  crossCorrelations: CrossCorrelation[],
  baseline: RegionBaseline,
  newsLinks: Map<string, NewsArticle[]>,
  cycloneProducts: IntelProduct[],
  now: number,
): IntelProduct[] {
  const scope: ProductScope = { newsLinks, consumedIds: new Set(), now };

  const products = [
    ...cycloneProductsOf(cycloneProducts, scope),
    ...crossSourceProductsOf(crossCorrelations, scope),
    ...anomalyProductsOf(baseline, scope),
    ...clusterProductsOf(clusters, scope),
  ];

  const covered = new Set(
    products.map((product) => product.region.toLowerCase()),
  );
  products.push(...newsProductsOf(covered, scope));

  products.sort(
    (left, right) =>
      right.priority - left.priority || right.timestamp - left.timestamp,
  );
  return products;
}

// ── Alert scorer ────────────────────────────────────────────

const ALERT_WINDOW_MS = 24 * HOUR;
const DEDUP_WINDOW_MS = 2 * HOUR;
const MAX_ALERT_SCORE = 10;

const AIRCRAFT_SCORES = {
  emergency: 7,
  radioFailure: 5,
  military: 2,
  correlated: 1,
} as const;

const EVENT_SCORES = {
  correlated: 1,
  elevatedRegion: 2,
  minSeverity: 3,
  elevatedRatio: 2,
  baselineHours: 6,
} as const;

const QUAKE_SCORES = {
  tsunami: 2,
  unusualRegion: 2,
  correlated: 1,
  minMagnitude: 4,
  quietRegionRate: 0.05,
  quietRegionMagnitude: 3,
} as const;

const FIRE_SCORES = { correlated: 2, minPower: 30 } as const;
const WEATHER_SCORES = { extreme: 6, severe: 4, correlated: 2 } as const;

const EVENT_SEVERITY_SCORES: readonly Band<number>[] = [
  { floor: 5, value: 6 },
  { floor: 4, value: 4 },
];

const EVENT_LABELS: readonly Band<string>[] = [
  { floor: 5, value: "CRISIS EVENT" },
  { floor: 4, value: "CONFLICT EVENT" },
];

const QUAKE_MAGNITUDE_SCORES: readonly Band<number>[] = [
  { floor: 7, value: 8 },
  { floor: 6, value: 6 },
  { floor: 5, value: 4 },
];

const FIRE_POWER_SCORES: readonly Band<number>[] = [
  { floor: 100, value: 5 },
  { floor: 50, value: 4 },
];

const SQUAWK_REASONS: Readonly<Record<SquawkCode, string>> = {
  [SquawkCode.Emergency]: "EMERGENCY",
  [SquawkCode.Hijack]: "HIJACK",
  [SquawkCode.RadioFailure]: "RADIO FAILURE",
};

const WEATHER_EXTREME = "Extreme";
const WEATHER_SEVERE = "Severe";

type ScoreContext = Readonly<{
  baseline: RegionBaseline;
  correlatedIds: ReadonlySet<string>;
}>;

type Scoring = { score: number; factors: string[] };

function finishAlert(
  item: DataPoint,
  label: string,
  scoring: Scoring,
): ScoredAlert {
  return {
    item,
    label,
    score: Math.min(MAX_ALERT_SCORE, scoring.score),
    factors: scoring.factors,
    count: 1,
  };
}

function addCorrelated(
  scoring: Scoring,
  context: ScoreContext,
  item: DataPoint,
  points: number,
  factor: string,
): void {
  if (!context.correlatedIds.has(item.id)) return;
  scoring.score += points;
  scoring.factors.push(factor);
}

function scoreAircraft(
  item: Extract<DataPoint, { type: Domain.Aircraft }>,
  context: ScoreContext,
): ScoredAlert | null {
  const squawk = item.data.squawk ?? "";
  if (!isEnumValue(squawk, SquawkCode)) return null;

  const scoring: Scoring = { score: 0, factors: [] };
  if (squawk === SquawkCode.RadioFailure) {
    scoring.score += AIRCRAFT_SCORES.radioFailure;
    scoring.factors.push("Radio failure squawk");
  } else {
    scoring.score += AIRCRAFT_SCORES.emergency;
    scoring.factors.push("Emergency/hijack squawk");
  }

  const isMilitary = item.data.military === true;
  if (isMilitary) {
    scoring.score += AIRCRAFT_SCORES.military;
    scoring.factors.push("Military aircraft");
  }
  addCorrelated(
    scoring,
    context,
    item,
    AIRCRAFT_SCORES.correlated,
    "Near conflict zone",
  );

  const reason = SQUAWK_REASONS[squawk];
  const prefix = isMilitary ? "MIL SQUAWK" : "SQUAWK";
  return finishAlert(item, `${prefix} ${squawk} \u2014 ${reason}`, scoring);
}

function regionElevated(
  baseline: RegionBaseline,
  country: string,
): number | null {
  const window = baseline.countries[country];
  if (!window) return null;
  const expected = avgRate(window) * EVENT_SCORES.baselineHours;
  if (expected <= 0) return null;
  const ratio = recentCount(window, EVENT_SCORES.baselineHours) / expected;
  return ratio >= EVENT_SCORES.elevatedRatio ? ratio : null;
}

function scoreEvent(
  item: Extract<DataPoint, { type: Domain.Events }>,
  context: ScoreContext,
): ScoredAlert | null {
  const severity = item.data.severity ?? 0;
  if (severity < EVENT_SCORES.minSeverity) return null;

  const scoring: Scoring = {
    score: bandValue(severity, EVENT_SEVERITY_SCORES, EVENT_SCORES.minSeverity),
    factors: [`Severity ${severity}/5`],
  };

  const ratio = regionElevated(context.baseline, getCountry(item));
  if (ratio !== null) {
    scoring.score += EVENT_SCORES.elevatedRegion;
    scoring.factors.push(`Region elevated (${ratio.toFixed(1)}\u00d7 baseline)`);
  }
  addCorrelated(
    scoring,
    context,
    item,
    EVENT_SCORES.correlated,
    "Correlated with other source",
  );

  return finishAlert(
    item,
    bandValue(severity, EVENT_LABELS, "TENSION EVENT"),
    scoring,
  );
}

function scoreQuake(
  item: Extract<DataPoint, { type: Domain.Quakes }>,
  context: ScoreContext,
): ScoredAlert | null {
  const magnitude = item.data.magnitude ?? 0;
  if (magnitude < QUAKE_SCORES.minMagnitude) return null;

  const scoring: Scoring = {
    score: bandValue(magnitude, QUAKE_MAGNITUDE_SCORES, EVENT_SCORES.minSeverity),
    factors: [`M${magnitude.toFixed(1)}`],
  };

  const tsunami = item.data.tsunami === true;
  if (tsunami) {
    scoring.score += QUAKE_SCORES.tsunami;
    scoring.factors.push("Tsunami alert");
  }

  const window = context.baseline.countries[getCountry(item)];
  if (
    window &&
    avgRate(window) < QUAKE_SCORES.quietRegionRate &&
    magnitude >= QUAKE_SCORES.quietRegionMagnitude
  ) {
    scoring.score += QUAKE_SCORES.unusualRegion;
    scoring.factors.push("Unusual seismic region");
  }
  addCorrelated(
    scoring,
    context,
    item,
    QUAKE_SCORES.correlated,
    "Secondary effects detected",
  );

  const suffix = tsunami ? " \u2014 TSUNAMI" : "";
  return finishAlert(
    item,
    `M${magnitude.toFixed(1)} EARTHQUAKE${suffix}`,
    scoring,
  );
}

function scoreFire(
  item: Extract<DataPoint, { type: Domain.Fires }>,
  context: ScoreContext,
): ScoredAlert | null {
  const power = item.data.frp ?? 0;
  if (power < FIRE_SCORES.minPower) return null;

  const scoring: Scoring = {
    score: bandValue(power, FIRE_POWER_SCORES, EVENT_SCORES.minSeverity),
    factors: [`FRP ${power.toFixed(0)} MW`],
  };
  addCorrelated(
    scoring,
    context,
    item,
    FIRE_SCORES.correlated,
    "Near conflict zone",
  );

  return finishAlert(
    item,
    `HIGH-INTENSITY FIRE \u2014 FRP ${power.toFixed(0)} MW`,
    scoring,
  );
}

function scoreWeather(
  item: Extract<DataPoint, { type: Domain.Weather }>,
  context: ScoreContext,
): ScoredAlert | null {
  const severity = item.data.severity ?? "";
  if (severity !== WEATHER_EXTREME && severity !== WEATHER_SEVERE) return null;

  const scoring: Scoring = {
    score:
      severity === WEATHER_EXTREME
        ? WEATHER_SCORES.extreme
        : WEATHER_SCORES.severe,
    factors: [`${severity} severity`],
  };
  addCorrelated(
    scoring,
    context,
    item,
    WEATHER_SCORES.correlated,
    "Vessels in affected area",
  );

  const event = item.data.event || "WEATHER ALERT";
  return finishAlert(
    item,
    `${severity.toUpperCase()} \u2014 ${event}`,
    scoring,
  );
}

function scoreItem(item: DataPoint, context: ScoreContext): ScoredAlert | null {
  switch (item.type) {
    case "aircraft":
      return scoreAircraft(item, context);
    case "events":
      return scoreEvent(item, context);
    case "quakes":
      return scoreQuake(item, context);
    case "fires":
      return scoreFire(item, context);
    case "weather":
      return scoreWeather(item, context);
    default:
      return null;
  }
}

function correlatedIdSet(
  crossCorrelations: CrossCorrelation[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const correlation of crossCorrelations) {
    ids.add(correlation.primary.id);
    for (const item of correlation.correlated) ids.add(item.id);
  }
  return ids;
}

function alertGroupKey(alert: ScoredAlert): string {
  return `${alert.item.type}:${getCountry(alert.item).toLowerCase().trim()}`;
}

function mergeIntoGroup(current: ScoredAlert, alert: ScoredAlert): void {
  current.groupedItems = current.groupedItems ?? [current.item];
  if (
    current.groupedItems.length < CORRELATION_POLICY.alertGroupPreviewLimit
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
  for (const factor of alert.factors) {
    if (!current.factors.includes(factor)) current.factors.push(factor);
  }
}

function dedupeAlerts(alerts: ScoredAlert[]): ScoredAlert[] {
  alerts.sort((left, right) => {
    const leftKey = alertGroupKey(left);
    const rightKey = alertGroupKey(right);
    if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
    return getTs(left.item) - getTs(right.item);
  });

  const deduped: ScoredAlert[] = [];
  let current: ScoredAlert | null = null;
  let currentKey = "";
  let currentTs = 0;

  for (const alert of alerts) {
    const key = alertGroupKey(alert);
    const ts = getTs(alert.item);
    const sameGroup =
      current !== null && key === currentKey && ts - currentTs < DEDUP_WINDOW_MS;

    if (sameGroup && current) {
      mergeIntoGroup(current, alert);
      continue;
    }
    if (current) deduped.push(current);
    current = { ...alert, groupedItems: [alert.item] };
    currentKey = key;
    currentTs = ts;
  }
  if (current) deduped.push(current);

  for (const alert of deduped) {
    if (alert.count > 1) {
      alert.label = `${alert.label} (+${alert.count - 1} similar)`;
    }
  }
  deduped.sort(
    (left, right) =>
      right.score - left.score || getTs(right.item) - getTs(left.item),
  );
  return deduped;
}

function scoreAlerts(
  allData: DataPoint[],
  baseline: RegionBaseline,
  crossCorrelations: CrossCorrelation[],
  now: number,
): ScoredAlert[] {
  const context: ScoreContext = {
    baseline,
    correlatedIds: correlatedIdSet(crossCorrelations),
  };
  const cutoff = now - ALERT_WINDOW_MS;
  const alerts: ScoredAlert[] = [];

  for (const item of allData) {
    if (getTs(item) < cutoff) continue;
    const alert = scoreItem(item, context);
    if (alert) alerts.push(alert);
  }
  return dedupeAlerts(alerts);
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
