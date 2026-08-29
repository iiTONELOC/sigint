export type Channel = {
  id: string;
  name: string;
  logo: string | null;
  url: string;
  country: string;
  languages: string[];
  featured: boolean;
};

export type ChannelCatalog = Readonly<Record<string, Channel>>;

export type GridLayout = 1 | 2 | 4 | 9;

export type SlotState = Readonly<{
  channel: Channel | null;
  error: boolean;
  loading: boolean;
}>;

export const EMPTY_VIDEO_SLOT_STATE: SlotState = {
  channel: null,
  error: false,
  loading: false,
};

export type PlayerHandle = {
  isLive: boolean;
  currentDelay: number;
  /** Buffered range: [start, end] in seconds, or null if no buffer */
  bufferRange: readonly [number, number] | null;
  currentTime: number;
  play: () => void;
  pause: () => void;
  goLive: () => void;
  seekTo: (time: number) => void;
  getVideoElement: () => HTMLVideoElement | null;
};

export type SavedSlot = {
  channelId: string;
  channelName: string;
  url: string;
  logo: string | null;
  country: string;
} | null;

export type SavedState = {
  grid: GridLayout;
  slots: SavedSlot[];
  unmutedSlot?: number | null;
};

export type Preset = { name: string; state: SavedState };

export type PresetCatalog = Readonly<Record<string, Preset>>;

const FEATURED_NAMES: readonly string[] = [
  "abc news",
  "cbs news",
  "cbsn",
  "nbc news",
  "cnn",
  "fox news",
  "msnbc",
  "cnbc",
  "bloomberg",
  "reuters",
  "c-span",
  "cspan",
  "newsmax",
  "newsnation",
  "fox business",
  "fox weather",
  "abc news live",
  "cbs news 24",
  "nbc news now",
  "pbs newshour",
  "pbs",
  "bbc news",
  "bbc world",
  "sky news",
  "gb news",
  "al jazeera english",
  "france 24 english",
  "france 24 en",
  "dw english",
  "dw news",
  "euronews english",
  "euronews",
  "nhk world",
  "cgtn",
  "arirang",
  "trt world",
  "wion",
  "ndtv",
  "sky news australia",
  "abc news au",
  "i24 news",
  "cna",
  "al arabiya",
  "times now",
  "rt news",
  "globo news",
];

export function checkFeatured(name: string): boolean {
  const n = name.toLowerCase().trim();
  return FEATURED_NAMES.some((f) => n === f || n.startsWith(f));
}

export enum RegionKey {
  UnitedStates = "US",
  All = "ALL",
  Featured = "★ TOP",
  Americas = "AMER",
  Europe = "EUR",
  MiddleEast = "MENA",
  Asia = "ASIA",
  Africa = "AFR",
  Oceania = "OCE",
}

const COUNTRY_CODES_BY_REGION: Readonly<
  Partial<Record<RegionKey, string>>
> = {
  [RegionKey.UnitedStates]: "US",
  [RegionKey.Americas]: `
    CA MX BR AR CL CO PE VE EC CU DO PR PA CR GT HN SV NI BO PY UY JM TT HT
  `,
  [RegionKey.Europe]: `
    GB UK FR DE IT ES PT NL BE AT CH SE NO DK FI PL CZ SK HU RO BG HR RS SI
    BA GR CY IE IS LT LV EE UA BY MD AL ME MK XK MT LU
  `,
  [RegionKey.MiddleEast]: `
    AE SA QA KW BH OM IQ IR SY LB JO PS IL YE EG LY TN DZ MA
  `,
  [RegionKey.Asia]: `
    CN JP KR IN PK BD LK NP MM TH VN PH MY SG ID KH LA TW HK MN KZ UZ KG TJ
    TM AF GE AM AZ TR
  `,
  [RegionKey.Africa]: `
    NG KE ZA GH ET TZ UG CI CM SN CD ML BF NE MZ MG AO ZW RW SD SS SO ER DJ
    MW ZM BW NA
  `,
  [RegionKey.Oceania]: "AU NZ FJ PG WS TO VU SB",
};

function buildRegionByCountry(): Readonly<Record<string, RegionKey>> {
  const regionByCountry: Record<string, RegionKey> = Object.create(null);
  for (const region of Object.values(RegionKey)) {
    const countryCodes = COUNTRY_CODES_BY_REGION[region];
    if (!countryCodes) continue;
    for (const countryCode of countryCodes.trim().split(/\s+/)) {
      regionByCountry[countryCode] = region;
    }
  }
  return regionByCountry;
}

const REGION_BY_COUNTRY = buildRegionByCountry();

export function getRegion(country: string): RegionKey {
  return REGION_BY_COUNTRY[(country ?? "").toUpperCase()] ?? RegionKey.All;
}
