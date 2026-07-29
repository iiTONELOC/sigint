import { AreaKind } from "@/workers/render/protocol";
import {
  isRecord,
  parseGeoJsonPolygonGeometry,
  type GeoJsonPolygonGeometry,
} from "@shared/geo";
import { BLANK_SEPARATOR, textOrEmpty } from "@shared/text";

export type CycloneWarning = {
  id: string;
  event: string;
  kind: AreaKind;
  headline: string;
  areaDesc: string;
  effective: string;
  expires: string;
  geometry: GeoJsonPolygonGeometry;
};

const ALERTS_URL =
  "https://api.weather.gov/alerts/active?status=actual&message_type=alert";

const REQUEST_HEADERS: Readonly<Record<string, string>> = {
  "User-Agent": "(sigint-dashboard, osint-tool)",
  Accept: "application/geo+json",
};

enum TropicalHazard {
  Hurricane = "hurricane",
  TropicalStorm = "tropical storm",
  StormSurge = "storm surge",
}

const TROPICAL_EVENTS: ReadonlySet<string> = new Set(
  Object.values(TropicalHazard).flatMap((hazard) =>
    Object.values(AreaKind).map((kind) => `${hazard}${BLANK_SEPARATOR}${kind}`),
  ),
);

function kindOf(eventLower: string): AreaKind {
  return eventLower.includes(AreaKind.Warning)
    ? AreaKind.Warning
    : AreaKind.Watch;
}

function toCycloneWarning(feature: unknown): CycloneWarning | null {
  if (!isRecord(feature)) return null;

  const geometry = parseGeoJsonPolygonGeometry(feature.geometry);
  if (!geometry) return null;

  const properties = isRecord(feature.properties) ? feature.properties : {};
  const event = textOrEmpty(properties.event);
  const eventLower = event.toLowerCase();
  if (!TROPICAL_EVENTS.has(eventLower)) return null;

  return {
    id: textOrEmpty(feature.id) || event,
    event,
    kind: kindOf(eventLower),
    headline: textOrEmpty(properties.headline),
    areaDesc: textOrEmpty(properties.areaDesc),
    effective: textOrEmpty(properties.effective),
    expires: textOrEmpty(properties.expires),
    geometry,
  };
}

function toCycloneWarnings(payload: unknown): CycloneWarning[] {
  if (!isRecord(payload) || !Array.isArray(payload.features)) return [];
  const warnings: CycloneWarning[] = [];
  for (const feature of payload.features) {
    const warning = toCycloneWarning(feature);
    if (warning) warnings.push(warning);
  }
  return warnings;
}

export async function fetchCycloneWarnings(): Promise<CycloneWarning[]> {
  try {
    const response = await fetch(ALERTS_URL, { headers: REQUEST_HEADERS });
    if (!response.ok) return [];
    return toCycloneWarnings(await response.json());
  } catch {
    return [];
  }
}
