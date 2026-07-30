import { authenticatedFetch } from "@/lib/net/authService";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";
import { rampBand, type Band } from "@/lib/format/rampLookup";
import type { EventPoint } from "@/features/intel/events/data/codec";

const EVENTS_URL = "/api/events/latest";

const EVENTS_ERROR = {
  request: "The events request failed",
  format: "The events response was not GDELT GeoJSON",
} as const;

// ── GDELT GeoJSON shape ─────────────────────────────────────────────

type GdeltFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
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
  type: "FeatureCollection";
  features: GdeltFeature[];
};

type ServerResponse = {
  data: GdeltResponse;
  fetchedAt: number;
  error?: string;
};

// ── Tone to category ────────────────────────────────────────────────

type ToneClass = { category: string; severity: number };

const TONE_CLASS_BANDS: ReadonlyArray<Band<ToneClass>> = [
  { max: -15, value: { category: "Crisis", severity: 5 } },
  { max: -10, value: { category: "Conflict", severity: 4 } },
  { max: -5, value: { category: "Tension", severity: 3 } },
  { max: -1, value: { category: "Concern", severity: 2 } },
];

function toneToCategorySeverity(tone: number): ToneClass {
  return rampBand(tone, TONE_CLASS_BANDS, {
    category: "Monitoring",
    severity: 1,
  });
}

/** First text node in the GDELT anchor. Scanned, not matched, because the
 *  equivalent pattern backtracks on markup with no closing tag. */
function extractTitle(html?: string, fallback = "Unknown Event"): string {
  if (!html) return fallback;
  const open = html.indexOf(">");
  if (open === -1) return fallback;
  const close = html.indexOf("<", open + 1);
  if (close <= open + 1) return fallback;
  return html.slice(open + 1, close).trim() || fallback;
}

const HASH_SHIFT = 5;
const HASH_RADIX = 36;

function hashString(value: string): string {
  let hash = 0;
  for (const character of value) {
    hash =
      Math.trunc((hash << HASH_SHIFT) - hash + (character.codePointAt(0) ?? 0));
  }
  return Math.abs(hash).toString(HASH_RADIX);
}

function toEventPoint(
  feature: GdeltFeature,
  index: number,
  now: number,
): EventPoint | null {
  const coords = feature.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const [lon, lat] = coords;
  if (lat == null || lon == null) return null;

  const props = feature.properties ?? {};
  const tone = props.urltone ? Number.parseFloat(props.urltone) : 0;
  const toneClass = toneToCategorySeverity(tone);

  return {
    id: props.url ? `GE${hashString(props.url)}` : `GE${index}-${now}`,
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
      severity: props.severity ?? toneClass.severity,
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
  const response = await authenticatedFetch(EVENTS_URL);
  if (!response.ok) throw new Error(EVENTS_ERROR.request);

  const json: ServerResponse = await response.json();
  const features = json.data?.features;
  if (!Array.isArray(features)) throw new Error(EVENTS_ERROR.format);

  const observedAt = now();
  const entities: EventPoint[] = [];
  for (const [index, feature] of features.entries()) {
    const point = toEventPoint(feature, index, observedAt);
    if (point) entities.push(point);
  }
  return { completeness: SourceCompleteness.Partial, entities, observedAt };
}
