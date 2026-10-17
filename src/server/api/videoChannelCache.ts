import { mkdir } from "fs/promises";
import { dirname } from "path";
import {
  FETCH_TIMEOUT_LARGE_MS,
  FETCH_TIMEOUT_STANDARD_MS,
  fetchJson,
  fetchWithTimeout,
} from "../lib/fetchWithTimeout";
import { createLogger } from "../lib/logger";
import { createPoller } from "../lib/poller";
import { errorMessage } from "../lib/errorMessage";
import { HttpHeader } from "@shared/http";
import {
  checkFeatured,
  VideoChannelPolling,
  type Channel,
  type ChannelCatalog,
} from "@shared/domain/videoChannel";

const logger = createLogger({ service: "video" });

enum VideoChannelSource {
  Channels = "https://iptv-org.github.io/api/channels.json",
  Streams = "https://iptv-org.github.io/api/streams.json",
}

enum VideoChannelCategory {
  General = "general",
  News = "news",
}

enum VideoChannelError {
  ListsUnavailable = "iptv-org channel lists unavailable",
}

enum VideoProbePolicy {
  Workers = 32,
}

enum VideoChannelStore {
  Path = ".cache/video-channels.json",
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

export type StoredCatalog = Readonly<{
  catalog: ChannelCatalog;
  fetchedAt: number;
}>;

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

export async function readStoredCatalog(
  path: string,
  now: number,
  ttlMs: number,
): Promise<StoredCatalog | null> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    const stored = (await file.json()) as StoredCatalog;
    return now - stored.fetchedAt <= ttlMs ? stored : null;
  } catch {
    return null;
  }
}

export async function writeStoredCatalog(
  path: string,
  stored: StoredCatalog,
): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, JSON.stringify(stored));
  } catch (err) {
    logger.warn(`📺 Video: store not written: ${errorMessage(err)}`);
  }
}

function probedCache(stored: StoredCatalog): VideoChannelCache {
  return {
    catalog: stored.catalog,
    probed: true,
    fetchedAt: stored.fetchedAt,
    channelCount: Object.keys(stored.catalog).length,
    error: null,
  };
}

async function restoreStoredCatalog(): Promise<void> {
  if (cache.probed) return;
  const stored = await readStoredCatalog(
    VideoChannelStore.Path,
    Date.now(),
    VideoChannelPolling.IntervalMs,
  );
  if (stored) cache = probedCache(stored);
}

async function fetchAllChannels(): Promise<void> {
  try {
    await restoreStoredCatalog();
    const [channels, streams] = await Promise.all([
      fetchJson<RawChannel[]>(VideoChannelSource.Channels, FETCH_TIMEOUT_LARGE_MS),
      fetchJson<RawStream[]>(VideoChannelSource.Streams, FETCH_TIMEOUT_LARGE_MS),
    ]);
    if (!channels || !streams) {
      cache = { ...cache, error: VideoChannelError.ListsUnavailable };
      return;
    }
    const candidates = selectNewsChannels(channels, streamUrlsByChannel(streams));
    if (!cache.probed) {
      cache = {
        catalog: unprobedCatalog(candidates),
        probed: false,
        fetchedAt: Date.now(),
        channelCount: candidates.length,
        error: null,
      };
    }
    const catalog = await probedCatalog(candidates, probeManifest, VideoProbePolicy.Workers);
    const stored: StoredCatalog = { catalog, fetchedAt: Date.now() };
    cache = probedCache(stored);
    await writeStoredCatalog(VideoChannelStore.Path, stored);
    logger.info(`📺 Video: ${cache.channelCount} live channels of ${candidates.length}`);
  } catch (err) {
    cache = { ...cache, error: errorMessage(err) };
    logger.warn(`📺 Video: ${cache.error}`);
  }
}

const poller = createPoller(fetchAllChannels, VideoChannelPolling.IntervalMs);

export function startVideoChannelPolling(): void {
  poller.start();
}

export function stopVideoChannelPolling(): void {
  poller.stop();
}

export function getVideoChannelCache(): VideoChannelCache {
  return cache;
}

export function __resetVideoChannelCacheForTests(): void {
  cache = EMPTY_VIDEO_CHANNEL_CACHE;
}
