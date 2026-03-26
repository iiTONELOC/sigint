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
  /** @deprecated Use layoutDesktop / layoutMobile instead */
  layout: `sigint.layout.${V}`,
  layoutDesktop: `sigint.layout.desktop.${V}`,
  layoutMobile: `sigint.layout.mobile.${V}`,
  /** @deprecated Use layoutPresetsDesktop / layoutPresetsMobile instead */
  layoutPresets: `sigint.layout.presets.${V}`,
  layoutPresetsDesktop: `sigint.layout.presets.desktop.${V}`,
  layoutPresetsMobile: `sigint.layout.presets.mobile.${V}`,
  dossier: `sigint.dossier.cache.${V}`,
  videoState: `sigint.videofeed.state.${V}`,
  videoPresets: `sigint.videofeed.presets.${V}`,
  theme: `sigint.theme.${V}`,
  colorOverrides: `sigint.color-overrides.${V}`,
  news: `sigint.news.articles.${V}`,
  newsState: `sigint.news.state.${V}`,
  intelBaseline: `sigint.intel.baseline.${V}`,
  dismissedAlerts: `sigint.alerts.dismissed.${V}`,
  tickerSpeed: `sigint.ticker.speed.${V}`,
  tickerHeight: `sigint.ticker.height.${V}`,
  walkthroughComplete: `sigint.walkthrough.complete.${V}`,
  layoutMode: `sigint.layout.mode.${V}`,
  aircraftMetadataDb: `sigint.aircraft.metadata-db.${V}`,
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
  [CACHE_KEYS.layout]: { label: "Pane layout (legacy)", group: "UI" },
  [CACHE_KEYS.layoutDesktop]: { label: "Desktop layout", group: "UI" },
  [CACHE_KEYS.layoutMobile]: { label: "Mobile layout", group: "UI" },
  [CACHE_KEYS.layoutPresets]: { label: "Layout presets (legacy)", group: "UI" },
  [CACHE_KEYS.layoutPresetsDesktop]: { label: "Desktop presets", group: "UI" },
  [CACHE_KEYS.layoutPresetsMobile]: { label: "Mobile presets", group: "UI" },
  [CACHE_KEYS.videoState]: { label: "Video feed state", group: "UI" },
  [CACHE_KEYS.videoPresets]: { label: "Video feed presets", group: "UI" },
  [CACHE_KEYS.theme]: { label: "Theme preference", group: "UI" },
  [CACHE_KEYS.colorOverrides]: { label: "Custom layer colors", group: "UI" },
  [CACHE_KEYS.news]: { label: "News articles", group: "Data" },
  [CACHE_KEYS.newsState]: { label: "News feed state", group: "UI" },
  [CACHE_KEYS.intelBaseline]: {
    label: "Intel regional baselines",
    group: "Data",
  },
  [CACHE_KEYS.dismissedAlerts]: { label: "Dismissed alerts", group: "UI" },
  [CACHE_KEYS.tickerSpeed]: { label: "Ticker speed", group: "UI" },
  [CACHE_KEYS.tickerHeight]: { label: "Ticker height mode", group: "UI" },
  [CACHE_KEYS.walkthroughComplete]: {
    label: "Walkthrough completed",
    group: "UI",
  },
  [CACHE_KEYS.layoutMode]: { label: "Layout mode override", group: "UI" },
  [CACHE_KEYS.aircraftMetadataDb]: {
    label: "Aircraft metadata DB",
    group: "Data",
  },
};
