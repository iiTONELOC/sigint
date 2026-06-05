// ── Tropical Cyclone warnings (client fetch) ─────────────────────────
// Watches/warnings are region polygons (NWS Alerts GeoJSON), not point
// DataPoints, so they don't flow through the BaseProvider/DataPoint path —
// they have their own thin fetch + hook and are sent to the render worker as
// a dedicated polygon layer (see GlobeVisualization "warnings" message).

import { authenticatedFetch } from "@/lib/authService";

export type WarningSeverity = "warning" | "watch";

export type CycloneWarning = {
  id: string;
  event: string;
  kind: WarningSeverity;
  headline: string;
  areaDesc: string;
  effective: string;
  expires: string;
  /** GeoJSON Polygon / MultiPolygon geometry in [lon, lat]. */
  geometry: unknown;
};

/** Fetch the current tropical watch/warning polygons from the server cache. */
export async function fetchCycloneWarnings(): Promise<CycloneWarning[]> {
  const res = await authenticatedFetch("/api/cyclones/warnings");
  if (!res.ok) return [];
  const json = (await res.json()) as { features?: CycloneWarning[] };
  return Array.isArray(json.features) ? json.features : [];
}
