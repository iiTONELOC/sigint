// ── Tropical Cyclone warnings (client fetch) ─────────────────────────
// Watches/warnings are region polygons (NWS Alerts GeoJSON), not point
// DataPoints, so they don't flow through the BaseProvider/DataPoint path —
// they have their own thin fetch + hook and are sent to the render worker as
// a dedicated polygon layer (see GlobeVisualization "warnings" message).
//
// Fetched CLIENT-SIDE, like the NOAA weather layer: api.weather.gov throttles
// /403s cloud-provider IPs, so a server-side proxy (Heroku) gets blocked while
// the browser's own IP gets through. NWS allows CORS + no key, so the browser
// can hit it directly. We pull all active alerts and keep just the six
// tropical watch/warning events with geometry.

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

const ALERTS_URL =
  "https://api.weather.gov/alerts/active?status=actual&message_type=alert";

const TROPICAL_EVENTS = new Set([
  "hurricane warning",
  "hurricane watch",
  "tropical storm warning",
  "tropical storm watch",
  "storm surge warning",
  "storm surge watch",
]);

function kindOf(eventLower: string): WarningSeverity {
  return eventLower.includes("warning") ? "warning" : "watch";
}

/** Keep only tropical watch/warning features that carry a geometry, slimmed. */
function toCycloneWarnings(json: unknown): CycloneWarning[] {
  if (!json || typeof json !== "object") return [];
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const out: CycloneWarning[] = [];
  for (const f of features) {
    if (!f || typeof f !== "object") continue;
    const feat = f as Record<string, unknown>;
    const geometry = feat.geometry;
    if (!geometry) continue; // no polygon — can't render
    const props = (feat.properties ?? {}) as Record<string, unknown>;
    const event = typeof props.event === "string" ? props.event : "";
    if (!TROPICAL_EVENTS.has(event.toLowerCase())) continue;

    out.push({
      id: typeof feat.id === "string" ? feat.id : event,
      event,
      kind: kindOf(event.toLowerCase()),
      headline: typeof props.headline === "string" ? props.headline : "",
      areaDesc: typeof props.areaDesc === "string" ? props.areaDesc : "",
      effective: typeof props.effective === "string" ? props.effective : "",
      expires: typeof props.expires === "string" ? props.expires : "",
      geometry,
    });
  }
  return out;
}

/** Fetch the current tropical watch/warning polygons directly from NWS. */
export async function fetchCycloneWarnings(): Promise<CycloneWarning[]> {
  try {
    const res = await fetch(ALERTS_URL, {
      headers: {
        "User-Agent": "(sigint-dashboard, osint-tool)",
        Accept: "application/geo+json",
      },
    });
    if (!res.ok) return [];
    return toCycloneWarnings(await res.json());
  } catch {
    return [];
  }
}
