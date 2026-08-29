import { CacheKey, isCacheKey } from "@shared/domain/cache";

export enum SettingsCacheGroup {
  Data = "Data",
  UserInterface = "UI",
}

type SettingsCacheMetadata = Readonly<{
  group: SettingsCacheGroup;
  label: string;
}>;

const SETTINGS_CACHE_METADATA: Readonly<
  Record<CacheKey, SettingsCacheMetadata>
> = {
  [CacheKey.Aircraft]: {
    group: SettingsCacheGroup.Data,
    label: "Aircraft positions",
  },
  [CacheKey.Earthquake]: {
    group: SettingsCacheGroup.Data,
    label: "Earthquake data",
  },
  [CacheKey.Events]: {
    group: SettingsCacheGroup.Data,
    label: "GDELT events",
  },
  [CacheKey.Ships]: {
    group: SettingsCacheGroup.Data,
    label: "AIS vessel data",
  },
  [CacheKey.Fires]: {
    group: SettingsCacheGroup.Data,
    label: "Fire hotspots",
  },
  [CacheKey.Weather]: {
    group: SettingsCacheGroup.Data,
    label: "Weather alerts",
  },
  [CacheKey.Cyclones]: {
    group: SettingsCacheGroup.Data,
    label: "Tropical cyclones",
  },
  [CacheKey.CycloneWarnings]: {
    group: SettingsCacheGroup.Data,
    label: "Tropical watches and warnings",
  },
  [CacheKey.CycloneDossier]: {
    group: SettingsCacheGroup.Data,
    label: "Cyclone dossier cache",
  },
  [CacheKey.Trails]: {
    group: SettingsCacheGroup.Data,
    label: "Position trails",
  },
  [CacheKey.Land]: {
    group: SettingsCacheGroup.Data,
    label: "Coastline geometry",
  },
  [CacheKey.Airports]: {
    group: SettingsCacheGroup.Data,
    label: "Airport coordinates",
  },
  [CacheKey.LayoutLegacy]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Pane layout (legacy)",
  },
  [CacheKey.LayoutDesktop]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Desktop layout",
  },
  [CacheKey.LayoutMobile]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Mobile layout",
  },
  [CacheKey.LayoutPresetsLegacy]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Layout presets (legacy)",
  },
  [CacheKey.LayoutPresetsDesktopLegacy]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Desktop presets (legacy)",
  },
  [CacheKey.LayoutPresetsMobileLegacy]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Mobile presets (legacy)",
  },
  [CacheKey.LayoutPresets]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Layout presets",
  },
  [CacheKey.VideoState]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Video feed state",
  },
  [CacheKey.VideoPresets]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Video feed presets",
  },
  [CacheKey.Theme]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Theme preference",
  },
  [CacheKey.ColorOverrides]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Custom layer colors",
  },
  [CacheKey.News]: {
    group: SettingsCacheGroup.Data,
    label: "News articles",
  },
  [CacheKey.NewsState]: {
    group: SettingsCacheGroup.UserInterface,
    label: "News feed state",
  },
  [CacheKey.IntelBaseline]: {
    group: SettingsCacheGroup.Data,
    label: "Intel regional baselines",
  },
  [CacheKey.DismissedAlerts]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Dismissed alerts",
  },
  [CacheKey.TickerSpeed]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Ticker speed",
  },
  [CacheKey.TickerHeight]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Ticker height mode",
  },
  [CacheKey.WalkthroughComplete]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Walkthrough completed",
  },
  [CacheKey.LayoutMode]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Layout mode override",
  },
  [CacheKey.AlwaysShowCyclones]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Always show cyclones toggle",
  },
  [CacheKey.Units]: {
    group: SettingsCacheGroup.UserInterface,
    label: "Units preference",
  },
};

export function settingsCacheMetadata(
  key: string,
): SettingsCacheMetadata | null {
  return isCacheKey(key) ? SETTINGS_CACHE_METADATA[key] : null;
}
