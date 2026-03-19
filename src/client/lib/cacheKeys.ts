// ── Cache key registry ───────────────────────────────────────────────
// Bump CACHE_VERSION to invalidate all caches at once.
// Individual keys use this version so there's exactly one place to change.

const V = "v1";

export const CACHE_KEYS = {
  aircraft: `sigint.opensky.aircraft-cache.${V}`,
  earthquake: `sigint.usgs.earthquake-cache.${V}`,
  events: `sigint.gdelt.events-cache.${V}`,
  ships: `sigint.ais.ship-cache.${V}`,
  fires: `sigint.firms.fire-cache.${V}`,
  weather: `sigint.noaa.weather-cache.${V}`,
  trails: `sigint.trails.${V}`,
  land: `sigint.land.hd.${V}`,
  layout: `sigint.layout.${V}`,
  layoutPresets: `sigint.layout.presets.${V}`,
  dossier: `sigint.dossier.cache.${V}`,
  videoState: `sigint.videofeed.state.${V}`,
  videoPresets: `sigint.videofeed.presets.${V}`,
  theme: `sigint.theme.${V}`,
} as const;

export type CacheKey = (typeof CACHE_KEYS)[keyof typeof CACHE_KEYS];

/** Human-readable labels for the settings UI */
export const CACHE_KEY_LABELS: Record<
  string,
  { label: string; group: "Data" | "UI" }
> = {
  [CACHE_KEYS.aircraft]: { label: "Aircraft positions", group: "Data" },
  [CACHE_KEYS.earthquake]: { label: "Earthquake data", group: "Data" },
  [CACHE_KEYS.events]: { label: "GDELT events", group: "Data" },
  [CACHE_KEYS.ships]: { label: "AIS vessel data", group: "Data" },
  [CACHE_KEYS.fires]: { label: "Fire hotspots", group: "Data" },
  [CACHE_KEYS.weather]: { label: "Weather alerts", group: "Data" },
  [CACHE_KEYS.trails]: { label: "Position trails", group: "Data" },
  [CACHE_KEYS.land]: { label: "Coastline geometry", group: "Data" },
  [CACHE_KEYS.dossier]: { label: "Dossier cache", group: "Data" },
  [CACHE_KEYS.layout]: { label: "Pane layout", group: "UI" },
  [CACHE_KEYS.layoutPresets]: { label: "Layout presets", group: "UI" },
  [CACHE_KEYS.videoState]: { label: "Video feed state", group: "UI" },
  [CACHE_KEYS.videoPresets]: { label: "Video feed presets", group: "UI" },
  [CACHE_KEYS.theme]: { label: "Theme preference", group: "UI" },
};
