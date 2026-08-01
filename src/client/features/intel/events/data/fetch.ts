import { authenticatedFetch } from "@/lib/net/authService";
import { parseIntelSeverity } from "@shared/domain/correlation";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";
import type { EventPoint } from "@/features/intel/events/data/codec";
import { classifyEventTone } from "../utils";

enum EventEndpoint {
  Latest = "/api/events/latest",
}

enum EventFetchError {
  Request = "The events request failed",
  Format = "The events response was not GDELT GeoJSON",
}

enum GdeltGeoJsonType {
  Feature = "Feature",
  Point = "Point",
  FeatureCollection = "FeatureCollection",
}

enum EventFetchPolicy {
  MinimumCoordinateCount = 2,
  HashShift = 5,
  HashRadix = 36,
}

enum EventIdentityToken {
  Prefix = "GE",
  Separator = "-",
}

enum EventFetchCopy {
  UnknownEvent = "Unknown Event",
}

type GdeltFeature = {
  type: GdeltGeoJsonType.Feature;
  geometry: {
    type: GdeltGeoJsonType.Point;
    coordinates: [number, number];
  };
  properties: {
    name?: string;
    html?: string;
    url?: string;
    urltone?: string;
    urlpubtimedate?: string;
    urlsocialimage?: string;
    urllang?: string;
    urlsourcecountry?: string;
    domain?: string;
    severity?: number;
    category?: string;
    goldstein?: number;
    mentions?: number;
    actor1?: string;
    actor2?: string;
    eventCode?: string;
  };
};

type GdeltResponse = {
  type: GdeltGeoJsonType.FeatureCollection;
  features: GdeltFeature[];
};

type ServerResponse = {
  data: GdeltResponse;
  fetchedAt: number;
  error?: string;
};

/** First text node in the GDELT anchor. Scanned, not matched, because the
 *  equivalent pattern backtracks on markup with no closing tag. */
function extractTitle(
  html?: string,
  fallback: string = EventFetchCopy.UnknownEvent,
): string {
  if (!html) return fallback;
  const open = html.indexOf(">");
  if (open === -1) return fallback;
  const close = html.indexOf("<", open + 1);
  if (close <= open + 1) return fallback;
  return html.slice(open + 1, close).trim() || fallback;
}

function hashString(value: string): string {
  let hash = 0;
  for (const character of value) {
    hash =
      Math.trunc(
        (hash << EventFetchPolicy.HashShift) -
          hash +
          (character.codePointAt(0) ?? 0),
      );
  }
  return Math.abs(hash).toString(EventFetchPolicy.HashRadix);
}

function toEventPoint(
  feature: GdeltFeature,
  index: number,
  now: number,
): EventPoint | null {
  const coords = feature.geometry?.coordinates;
  if (!coords || coords.length < EventFetchPolicy.MinimumCoordinateCount) {
    return null;
  }
  const [lon, lat] = coords;
  if (lat == null || lon == null) return null;

  const props = feature.properties ?? {};
  const tone = props.urltone ? Number.parseFloat(props.urltone) : 0;
  const toneClass = classifyEventTone(tone);

  return {
    id: props.url
      ? `${EventIdentityToken.Prefix}${hashString(props.url)}`
      : `${EventIdentityToken.Prefix}${index}${EventIdentityToken.Separator}${now}`,
    type: Domain.Events,
    lat,
    lon,
    timestamp: props.urlpubtimedate
      ? new Date(props.urlpubtimedate).toISOString()
      : new Date(now).toISOString(),
    data: {
      headline: extractTitle(props.html, props.url || undefined),
      category: props.category ?? toneClass.category,
      source: props.domain ?? undefined,
      sourceDomain: props.domain ?? undefined,
      sourceCountry: props.urlsourcecountry ?? undefined,
      language: props.urllang ?? undefined,
      url: props.url ?? undefined,
      imageUrl: props.urlsocialimage ?? undefined,
      tone: Number.isFinite(tone) ? tone : undefined,
      severity: parseIntelSeverity(props.severity ?? toneClass.severity),
      locationName: props.name ?? undefined,
      goldstein: props.goldstein,
      mentions: props.mentions,
      actor1: props.actor1 || undefined,
      actor2: props.actor2 || undefined,
      eventCode: props.eventCode || undefined,
    },
  };
}

export type EventFetchSnapshot = Readonly<{
  completeness: SourceCompleteness.Partial;
  entities: readonly EventPoint[];
  observedAt: number;
}>;

/**
 * GDELT drops a new export every fifteen minutes and each one only covers
 * that window, so a snapshot is always partial.
 */
export async function fetchEventSnapshot(
  now: () => number = Date.now,
): Promise<EventFetchSnapshot> {
  const response = await authenticatedFetch(EventEndpoint.Latest);
  if (!response.ok) throw new Error(EventFetchError.Request);

  const json: ServerResponse = await response.json();
  const features = json.data?.features;
  if (!Array.isArray(features)) throw new Error(EventFetchError.Format);

  const observedAt = now();
  const entities: EventPoint[] = [];
  for (const [index, feature] of features.entries()) {
    const point = toEventPoint(feature, index, observedAt);
    if (point) entities.push(point);
  }
  return { completeness: SourceCompleteness.Partial, entities, observedAt };
}
