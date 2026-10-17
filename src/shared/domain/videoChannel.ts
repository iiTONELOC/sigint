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

export const VIDEO_CHANNELS_ROUTE = "/api/video/channels";

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
