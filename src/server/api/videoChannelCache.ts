import { resolve } from "path";
import {
  FETCH_TIMEOUT_STANDARD_MS,
  fetchWithTimeout,
} from "../lib/fetchWithTimeout";
import { createLogger } from "../lib/logger";
import { errorMessage } from "../lib/errorMessage";
import { gunzipText, HttpHeader } from "@shared/http";
import {
  checkFeatured,
  type Channel,
  type ChannelCatalog,
} from "@shared/domain/videoChannel";

const logger = createLogger({ service: "video" });

export const VIDEO_CHANNELS_PATH = resolve(import.meta.dir, "../data/video-channels.json.gz");

enum VideoChannelCategory {
  General = "general",
  News = "news",
}

enum VideoProbeOrigin {
  Value = "https://sigint.local",
}

enum VideoManifestToken {
  Header = "#EXTM3U",
}

type RawChannel = Readonly<{
  id: string;
  name: string;
  country?: string;
  languages?: string[];
  categories?: string[];
  logo: string | null;
  is_nsfw: boolean;
}>;

type RawStream = Readonly<{ channel?: string; url?: string }>;

export type ChannelCandidate = Readonly<{
  channel: Omit<Channel, "url">;
  urls: readonly string[];
}>;

export type StreamProbe = (url: string) => Promise<boolean>;

type VideoChannelCache = Readonly<{
  catalog: ChannelCatalog;
  probed: boolean;
  fetchedAt: number;
  channelCount: number;
  error: string | null;
}>;

const EMPTY_VIDEO_CHANNEL_CACHE: VideoChannelCache = {
  catalog: {},
  probed: false,
  fetchedAt: 0,
  channelCount: 0,
  error: null,
};

let cache: VideoChannelCache = EMPTY_VIDEO_CHANNEL_CACHE;

function isNewsChannel(channel: RawChannel): boolean {
  if (channel.is_nsfw) return false;
  return (channel.categories ?? []).some((category) => {
    const key = category.toLowerCase();
    return key === VideoChannelCategory.News || key === VideoChannelCategory.General;
  });
}

export function streamUrlsByChannel(
  streams: readonly RawStream[],
): ReadonlyMap<string, readonly string[]> {
  const urls = new Map<string, string[]>();
  for (const stream of streams) {
    if (!stream.channel || !stream.url) continue;
    const list = urls.get(stream.channel) ?? [];
    list.push(stream.url);
    urls.set(stream.channel, list);
  }
  return urls;
}

export function selectNewsChannels(
  channels: readonly RawChannel[],
  urlsByChannel: ReadonlyMap<string, readonly string[]>,
): ChannelCandidate[] {
  const candidates: ChannelCandidate[] = [];
  for (const channel of channels) {
    const urls = urlsByChannel.get(channel.id);
    if (!urls?.length || !isNewsChannel(channel)) continue;
    candidates.push({
      channel: {
        id: channel.id,
        name: channel.name,
        logo: channel.logo,
        country: channel.country ?? "",
        languages: channel.languages ?? [],
        featured: checkFeatured(channel.name),
      },
      urls,
    });
  }
  return candidates;
}

function sortedCatalog(channels: Channel[]): ChannelCatalog {
  channels.sort((left, right) => {
    if (left.featured !== right.featured) return left.featured ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  return Object.fromEntries(channels.map((channel) => [channel.id, channel]));
}

export function unprobedCatalog(
  candidates: readonly ChannelCandidate[],
): ChannelCatalog {
  return sortedCatalog(
    candidates.map(({ channel, urls }) => ({ ...channel, url: urls[0] ?? "" })),
  );
}

async function firstLiveUrl(
  urls: readonly string[],
  probe: StreamProbe,
): Promise<string | null> {
  for (const url of urls) {
    if (await probe(url)) return url;
  }
  return null;
}

export async function probedCatalog(
  candidates: readonly ChannelCandidate[],
  probe: StreamProbe,
  workers: number,
): Promise<ChannelCatalog> {
  const live: Channel[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < candidates.length) {
      const candidate = candidates[next];
      next += 1;
      if (!candidate) return;
      const url = await firstLiveUrl(candidate.urls, probe);
      if (url) live.push({ ...candidate.channel, url });
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));
  return sortedCatalog(live);
}

async function readManifestHead(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const timeout = new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
    setTimeout(() => resolve({ done: true, value: undefined }), FETCH_TIMEOUT_STANDARD_MS);
  });
  const { value } = await Promise.race([reader.read(), timeout]);
  await reader.cancel().catch(() => undefined);
  return value ? new TextDecoder().decode(value) : "";
}

export async function probeManifest(url: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(url, FETCH_TIMEOUT_STANDARD_MS, {
      headers: { [HttpHeader.Origin]: VideoProbeOrigin.Value },
    });
    if (!response.ok || !response.headers.get(HttpHeader.AccessControlAllowOrigin)) {
      await response.body?.cancel().catch(() => undefined);
      return false;
    }
    return (await readManifestHead(response)).includes(VideoManifestToken.Header);
  } catch {
    return false;
  }
}

export async function loadVideoChannels(path = VIDEO_CHANNELS_PATH): Promise<void> {
  try {
    const file = Bun.file(path);
    const catalog = JSON.parse(await gunzipText(file.stream())) as ChannelCatalog;
    cache = {
      catalog,
      probed: true,
      fetchedAt: file.lastModified,
      channelCount: Object.keys(catalog).length,
      error: null,
    };
    logger.info(`📺 Video: ${cache.channelCount} channels from the static list`);
  } catch (err) {
    cache = { ...EMPTY_VIDEO_CHANNEL_CACHE, error: errorMessage(err) };
    logger.warn(`📺 Video: static list unavailable: ${cache.error}`);
  }
}

export function getVideoChannelCache(): VideoChannelCache {
  return cache;
}

export function __resetVideoChannelCacheForTests(): void {
  cache = EMPTY_VIDEO_CHANNEL_CACHE;
}
