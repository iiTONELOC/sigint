import type { Channel } from "./videoFeedTypes";
import { checkFeatured } from "./videoFeedTypes";

type RawChannel = {
  id: string;
  name: string;
  country: string;
  languages: string[];
  categories: string[];
  logo: string | null;
  is_nsfw: boolean;
};

type RawStream = {
  channel: string;
  url: string;
  status: string;
};

let channelCache: Channel[] | null = null;
let fetchingChannels = false;
const channelListeners = new Set<() => void>();

export async function fetchNewsChannels(): Promise<Channel[]> {
  if (channelCache) return channelCache;
  if (fetchingChannels) {
    return new Promise((resolve) => {
      const cb = () => {
        channelListeners.delete(cb);
        resolve(channelCache ?? []);
      };
      channelListeners.add(cb);
    });
  }
  fetchingChannels = true;
  try {
    const [channelsRes, streamsRes] = await Promise.all([
      fetch("https://iptv-org.github.io/api/channels.json"),
      fetch("https://iptv-org.github.io/api/streams.json"),
    ]);
    if (!channelsRes.ok || !streamsRes.ok) throw new Error("Failed to fetch");
    const channels: RawChannel[] = await channelsRes.json();
    const streams: RawStream[] = await streamsRes.json();

    const streamMap = new Map<string, string>();
    for (const s of streams) {
      if (!s.channel || !s.url || s.status === "error") continue;
      if (!streamMap.has(s.channel)) streamMap.set(s.channel, s.url);
    }

    const result: Channel[] = [];
    for (const ch of channels) {
      if (ch.is_nsfw) continue;
      const hasNews = ch.categories?.some(
        (c) => c.toLowerCase() === "news" || c.toLowerCase() === "general",
      );
      if (!hasNews) continue;
      const url = streamMap.get(ch.id);
      if (!url) continue;
      result.push({
        id: ch.id,
        name: ch.name,
        logo: ch.logo,
        url,
        country: ch.country ?? "",
        languages: ch.languages ?? [],
        categories: ch.categories ?? [],
        featured: checkFeatured(ch.name),
      });
    }
    result.sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    channelCache = result;
    channelListeners.forEach((cb) => cb());
    return result;
  } catch {
    channelCache = [];
    channelListeners.forEach((cb) => cb());
    return [];
  } finally {
    fetchingChannels = false;
  }
}
