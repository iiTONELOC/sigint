// ── Correlation engine types ────────────────────────────────────────
// Shared shape definitions used by every correlation module.

import type { DataPoint } from "@/features/base/dataPoints";
import type { NewsArticle } from "@/features/news";

/** A correlated intelligence product — not raw data, derived insight */
export type IntelProduct = {
  id: string;
  type: "cluster" | "cross-source" | "anomaly" | "trend" | "news-link";
  priority: number; // 1-10
  title: string;
  summary: string;
  region: string; // country or region name
  sources: DataPoint[]; // bounded source preview
  sourceCount?: number;
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
  /** Bounded group preview for watch mode cycling. */
  groupedItems?: DataPoint[];
};

/** Per-country rolling event counts */
export type CountryWindow = {
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

export type CorrelationResult = {
  products: IntelProduct[];
  alerts: ScoredAlert[];
  baseline: RegionBaseline;
};
