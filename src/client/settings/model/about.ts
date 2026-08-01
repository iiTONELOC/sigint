export enum SettingsAboutCopy {
  ApplicationName = "SIGINT",
  ApplicationStack = "Bun · React 19 · Tailwind 4 · Canvas 2D",
  AuthorName = "Anthony Tropeano",
  AuthorUrl = "https://github.com/iiTONELOC",
  Rendering = "Web Worker + OffscreenCanvas",
}

export enum SettingsAboutSource {
  Aircraft = "adsb.fi",
  Earthquakes = "USGS Earthquake Hazards",
  Events = "GDELT 2.0",
  Ships = "aisstream.io",
  Fires = "NASA FIRMS",
  Weather = "NOAA Weather",
  Video = "iptv-org",
}

export enum SettingsNewsCopy {
  CacheDuration = "Articles are cached locally for 12 hours",
  Polling = "These feeds are polled on the server every 10 minutes and cached locally.",
}

type SettingsAboutSourceMetadata = Readonly<{
  description: string;
  url: string;
}>;

export const SETTINGS_ABOUT_SOURCE_METADATA: Readonly<
  Record<SettingsAboutSource, SettingsAboutSourceMetadata>
> = {
  [SettingsAboutSource.Aircraft]: {
    description: "Aircraft positions",
    url: "https://opendata.adsb.fi",
  },
  [SettingsAboutSource.Earthquakes]: {
    description: "Seismic data",
    url: "https://earthquake.usgs.gov",
  },
  [SettingsAboutSource.Events]: {
    description: "Event intelligence",
    url: "https://www.gdeltproject.org",
  },
  [SettingsAboutSource.Ships]: {
    description: "AIS vessel tracking",
    url: "https://aisstream.io",
  },
  [SettingsAboutSource.Fires]: {
    description: "Fire hotspots",
    url: "https://firms.modaps.eosdis.nasa.gov",
  },
  [SettingsAboutSource.Weather]: {
    description: "Severe weather alerts",
    url: "https://api.weather.gov",
  },
  [SettingsAboutSource.Video]: {
    description: "Video feed channels",
    url: "https://github.com/iptv-org",
  },
};
