import { isEnumValue } from "@shared/types/enum";

export enum CacheKey {
  Aircraft = "sigint.adsbfi.aircraft-cache.v1",
  Earthquake = "sigint.usgs.earthquake-cache.v1",
  Events = "sigint.gdelt.events-cache.v1",
  Ships = "sigint.ais.ship-cache.v1",
  Fires = "sigint.firms.fire-cache.v1",
  Weather = "sigint.noaa.weather-cache.v1",
  Cyclones = "sigint.nhc.cyclones-cache.v1",
  CycloneWarnings = "sigint.nws.cyclone-warnings.v1",
  CycloneDossier = "sigint.nhc.cyclone-dossier-cache.v1",
  Trails = "sigint.trails.v1",
  Land = "sigint.land.hd.v1",
  Airports = "sigint.airports.v1",
  /** @deprecated Read only for stored-layout migration. */
  LayoutLegacy = "sigint.layout.v1",
  LayoutDesktop = "sigint.layout.desktop.v1",
  LayoutMobile = "sigint.layout.mobile.v1",
  /** @deprecated Read only for stored-preset migration. */
  LayoutPresetsLegacy = "sigint.layout.presets.v1",
  /** @deprecated Read only for stored-preset migration. */
  LayoutPresetsDesktopLegacy = "sigint.layout.presets.desktop.v1",
  /** @deprecated Read only for stored-preset migration. */
  LayoutPresetsMobileLegacy = "sigint.layout.presets.mobile.v1",
  LayoutPresets = "sigint.layout.presets.shared.v1",
  VideoState = "sigint.videofeed.state.v1",
  VideoPresets = "sigint.videofeed.presets.v1",
  Theme = "sigint.theme.v1",
  ColorOverrides = "sigint.color-overrides.v1",
  News = "sigint.news.articles.v1",
  NewsState = "sigint.news.state.v1",
  IntelBaseline = "sigint.intel.baseline.v1",
  DismissedAlerts = "sigint.alerts.dismissed.v1",
  TickerSpeed = "sigint.ticker.speed.v1",
  TickerHeight = "sigint.ticker.height.v1",
  WalkthroughComplete = "sigint.walkthrough.complete.v1",
  LayoutMode = "sigint.layout.mode.v1",
  AlwaysShowCyclones = "sigint.preferences.always-show-cyclones.v1",
  Units = "sigint.preferences.units.v1",
}

export function isCacheKey(value: unknown): value is CacheKey {
  return isEnumValue(value, CacheKey);
}
