// ── Types ────────────────────────────────────────────────────────────

export type Channel = {
  id: string;
  name: string;
  logo: string | null;
  url: string;
  country: string;
  languages: string[];
  categories: string[];
  featured: boolean;
};

export type GridLayout = 1 | 2 | 4 | 9;

export type SlotState = {
  channel: Channel | null;
  error: boolean;
  loading: boolean;
};

export type PlayerHandle = {
  isPaused: boolean;
  isLive: boolean;
  currentDelay: number;
  /** Buffered range: [start, end] in seconds, or null if no buffer */
  bufferRange: [number, number] | null;
  currentTime: number;
  play: () => void;
  pause: () => void;
  goLive: () => void;
  seekTo: (time: number) => void;
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

// ── Featured channel detection ───────────────────────────────────────

const FEATURED_NAMES = [
  // US networks
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
  // UK
  "bbc news",
  "bbc world",
  "sky news",
  "gb news",
  // International English
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

// ── Region mapping ───────────────────────────────────────────────────

export type RegionKey =
  | "all"
  | "featured"
  | "us"
  | "americas"
  | "europe"
  | "mideast"
  | "asia"
  | "africa"
  | "oceania";

export const REGIONS: { key: RegionKey; label: string }[] = [
  { key: "us", label: "US" },
  { key: "all", label: "ALL" },
  { key: "featured", label: "★ TOP" },
  { key: "americas", label: "AMER" },
  { key: "europe", label: "EUR" },
  { key: "mideast", label: "MENA" },
  { key: "asia", label: "ASIA" },
  { key: "africa", label: "AFR" },
  { key: "oceania", label: "OCE" },
];

export function getRegion(country: string): RegionKey {
  const c = (country ?? "").toUpperCase();
  if (c === "US") return "us";
  const americas = new Set([
    "CA",
    "MX",
    "BR",
    "AR",
    "CL",
    "CO",
    "PE",
    "VE",
    "EC",
    "CU",
    "DO",
    "PR",
    "PA",
    "CR",
    "GT",
    "HN",
    "SV",
    "NI",
    "BO",
    "PY",
    "UY",
    "JM",
    "TT",
    "HT",
  ]);
  const europe = new Set([
    "GB",
    "UK",
    "FR",
    "DE",
    "IT",
    "ES",
    "PT",
    "NL",
    "BE",
    "AT",
    "CH",
    "SE",
    "NO",
    "DK",
    "FI",
    "PL",
    "CZ",
    "SK",
    "HU",
    "RO",
    "BG",
    "HR",
    "RS",
    "SI",
    "BA",
    "GR",
    "CY",
    "IE",
    "IS",
    "LT",
    "LV",
    "EE",
    "UA",
    "BY",
    "MD",
    "AL",
    "ME",
    "MK",
    "XK",
    "MT",
    "LU",
  ]);
  const mideast = new Set([
    "AE",
    "SA",
    "QA",
    "KW",
    "BH",
    "OM",
    "IQ",
    "IR",
    "SY",
    "LB",
    "JO",
    "PS",
    "IL",
    "YE",
    "EG",
    "LY",
    "TN",
    "DZ",
    "MA",
  ]);
  const asia = new Set([
    "CN",
    "JP",
    "KR",
    "IN",
    "PK",
    "BD",
    "LK",
    "NP",
    "MM",
    "TH",
    "VN",
    "PH",
    "MY",
    "SG",
    "ID",
    "KH",
    "LA",
    "TW",
    "HK",
    "MN",
    "KZ",
    "UZ",
    "KG",
    "TJ",
    "TM",
    "AF",
    "GE",
    "AM",
    "AZ",
    "TR",
  ]);
  const africa = new Set([
    "NG",
    "KE",
    "ZA",
    "GH",
    "ET",
    "TZ",
    "UG",
    "CI",
    "CM",
    "SN",
    "CD",
    "ML",
    "BF",
    "NE",
    "MZ",
    "MG",
    "AO",
    "ZW",
    "RW",
    "SD",
    "SS",
    "SO",
    "ER",
    "DJ",
    "MW",
    "ZM",
    "BW",
    "NA",
  ]);
  const oceania = new Set(["AU", "NZ", "FJ", "PG", "WS", "TO", "VU", "SB"]);
  if (americas.has(c)) return "americas";
  if (europe.has(c)) return "europe";
  if (mideast.has(c)) return "mideast";
  if (asia.has(c)) return "asia";
  if (africa.has(c)) return "africa";
  if (oceania.has(c)) return "oceania";
  return "all";
}

export const DVR_BACK_BUFFER = 300; // 5 min
