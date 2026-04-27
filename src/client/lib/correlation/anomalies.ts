// ── Anomaly detection ──────────────────────────────────────────────
// Compares current 6-hour activity in each country to its rolling
// baseline. ≥3× and ≥3 events triggers an "Activity spike" anomaly.

import type { RegionBaseline } from "./types";
import { avgRate, recentCount } from "./baseline";

export type AnomalyHit = {
  country: string;
  ratio: number;
  last6h: number;
  expected6h: number;
};

export function detectAnomalies(baseline: RegionBaseline): AnomalyHit[] {
  const hits: AnomalyHit[] = [];
  for (const [country, win] of Object.entries(baseline.countries)) {
    const avg = avgRate(win);
    if (avg < 0.1) continue;
    const last6h = recentCount(win, 6);
    const expected6h = avg * 6;
    const ratio = expected6h > 0 ? last6h / expected6h : 0;
    if (ratio >= 3 && last6h >= 3) {
      hits.push({ country, ratio, last6h, expected6h });
    }
  }
  return hits;
}
