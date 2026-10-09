import { AngleConversion, GeoLimit, GeoMeasurement } from "@shared/geo";
import { MS_PER_MINUTE } from "@shared/time";
import { RenderCycloneLayer, type RenderCycloneOverlay } from "@/workers/render/protocol";

export enum RasterSource {
  Satellite = "satellite",
  Radar = "radar",
}

export enum RasterBlend {
  Over = "source-over",
  Screen = "screen",
}

type RasterSourceMetadata = Readonly<{
  toggle: RenderCycloneLayer;
  url: string;
  layer: string;
  degreesPerPixel: number;
  latestStepMs: number;
  blend: RasterBlend;
  alpha: number;
}>;

export const RASTER_SOURCE_METADATA: Readonly<Record<RasterSource, RasterSourceMetadata>> = {
  [RasterSource.Satellite]: {
    toggle: RenderCycloneLayer.Satellite,
    url: "https://nowcoast.noaa.gov/geoserver/observations/satellite/ows",
    layer: "goes_longwave_imagery",
    degreesPerPixel: 0.02,
    latestStepMs: 5 * MS_PER_MINUTE,
    blend: RasterBlend.Screen,
    alpha: 0.9,
  },
  [RasterSource.Radar]: {
    toggle: RenderCycloneLayer.Radar,
    url: "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows",
    layer: "conus_bref_qcd",
    degreesPerPixel: 0.01,
    latestStepMs: 2 * MS_PER_MINUTE,
    blend: RasterBlend.Over,
    alpha: 0.8,
  },
};

export function visibleRasterSources(overlay: RenderCycloneOverlay): RasterSource[] {
  return Object.values(RasterSource).filter((source) => overlay[RASTER_SOURCE_METADATA[source].toggle]);
}

const RASTER_MAX_PIXELS = 2048;
const RASTER_DEFAULT_REACH_NM = 600;
const RASTER_REACH_PAST_GALES_NM = 450;
const RASTER_LOOP_FRAMES = 8;
const RASTER_LOOP_STEP_MS = 15 * MS_PER_MINUTE;
// The loop holds on the latest frame so the eye catches the restart and reads the motion.
const RASTER_LATEST_HOLD_FRAMES = 3;
export const RASTER_FRAME_MS = 600;

export type RasterBounds = Readonly<{ minLat: number; maxLat: number; minLon: number; maxLon: number }>;

export type RasterImage = Readonly<{ image: ImageBitmap; bounds: RasterBounds; source: RasterSource }>;

function rasterPixels(spanDegrees: number, degreesPerPixel: number): number {
  return Math.min(RASTER_MAX_PIXELS, Math.max(1, Math.round(spanDegrees / degreesPerPixel)));
}

/** One NOAA WMS 1.3.0 GetMap frame; CRS:84 orders the box longitude first. */
export function rasterImageUrl(source: RasterSource, bounds: RasterBounds, timeMs: number): string {
  const metadata = RASTER_SOURCE_METADATA[source];
  const query = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetMap",
    layers: metadata.layer,
    styles: "",
    crs: "CRS:84",
    bbox: [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat].join(","),
    width: String(rasterPixels(bounds.maxLon - bounds.minLon, metadata.degreesPerPixel)),
    height: String(rasterPixels(bounds.maxLat - bounds.minLat, metadata.degreesPerPixel)),
    format: "image/png",
    transparent: "true",
    time: new Date(timeMs).toISOString(),
  });
  return `${metadata.url}?${query.toString()}`;
}

// Frames sit on a fixed step, oldest first, so a past frame keeps its URL and is fetched once.
function loopTimes(source: RasterSource, now: number): number[] {
  const gridLatest = Math.floor(now / RASTER_LOOP_STEP_MS) * RASTER_LOOP_STEP_MS;
  const grid = Array.from({ length: RASTER_LOOP_FRAMES }, (_, index) =>
    gridLatest - (RASTER_LOOP_FRAMES - 1 - index) * RASTER_LOOP_STEP_MS);
  const { latestStepMs } = RASTER_SOURCE_METADATA[source];
  const newest = Math.floor(now / latestStepMs) * latestStepMs;
  return newest > gridLatest ? [...grid, newest] : grid;
}


export type RasterCircle = Readonly<{ lat: number; lon: number; reachNm: number }>;

export type RasterArea = Readonly<{ bounds: RasterBounds; circle: RasterCircle }>;

/** The storm's own circulation: a circle past its tropical-storm-force winds, so other weather is left out. */
export function stormRasterArea(lat: number, lon: number, galeRadiiNm: readonly number[]): RasterArea {
  const widestGale = Math.max(0, ...galeRadiiNm);
  const reachNm = widestGale > 0 ? widestGale + RASTER_REACH_PAST_GALES_NM : RASTER_DEFAULT_REACH_NM;
  const latSpan = reachNm / GeoMeasurement.NauticalMilesPerDegree;
  const lonSpan = latSpan / Math.max(Math.cos(lat * AngleConversion.RadiansPerDegree), Number.EPSILON);
  return {
    circle: { lat, lon, reachNm },
    bounds: {
      minLat: Math.max(GeoLimit.MinLatitude, Math.floor(lat - latSpan)),
      maxLat: Math.min(GeoLimit.MaxLatitude, Math.ceil(lat + latSpan)),
      minLon: Math.max(GeoLimit.MinLongitude, Math.floor(lon - lonSpan)),
      maxLon: Math.min(GeoLimit.MaxLongitude, Math.ceil(lon + lonSpan)),
    },
  };
}

type RasterEntry = { image: RasterImage | null; group: string };

/** Loop frames by source, area and time; each frame is fetched once and dropped once it leaves the loop. */
export class StormRasterCache {
  private readonly entries = new Map<string, RasterEntry>();

  request(stormId: string, source: RasterSource, bounds: RasterBounds, now: number): void {
    const group = `${stormId}:${source}`;
    const urls = new Set(loopTimes(source, now).map((timeMs) => rasterImageUrl(source, bounds, timeMs)));
    for (const url of urls) {
      if (!this.entries.has(url)) this.load(url, { bounds, source }, group);
    }
    this.prune(group, urls);
  }

  /** The frame to show now: the loop position while animating, otherwise the latest frame. */
  peek(source: RasterSource, bounds: RasterBounds, now: number, animate: boolean): RasterImage | null {
    const frames = loopTimes(source, now)
      .map((timeMs) => this.entries.get(rasterImageUrl(source, bounds, timeMs))?.image ?? null)
      .filter((frame): frame is RasterImage => frame !== null);
    const cycle = frames.length + RASTER_LATEST_HOLD_FRAMES;
    const index = animate ? Math.min(Math.floor(now / RASTER_FRAME_MS) % cycle, frames.length - 1) : frames.length - 1;
    return frames[index] ?? null;
  }

  private load(url: string, target: Omit<RasterImage, "image">, group: string): void {
    const entry: RasterEntry = { image: null, group };
    this.entries.set(url, entry);
    void fetch(url)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => (blob ? createImageBitmap(blob) : null))
      .then((image) => {
        if (!image) return;
        if (this.entries.get(url) !== entry) {
          image.close();
          return;
        }
        entry.image = { ...target, image };
      })
      .catch(() => undefined);
  }

  private prune(group: string, current: ReadonlySet<string>): void {
    for (const [url, entry] of this.entries) {
      if (entry.group !== group || current.has(url)) continue;
      entry.image?.image.close();
      this.entries.delete(url);
    }
  }
}
