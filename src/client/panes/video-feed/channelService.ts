import type { Channel, ChannelCatalog } from "./videoFeedTypes";
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

enum RawStreamStatus {
  Error = "error",
}

type RawStream = {
  channel: string;
  url: string;
  status: RawStreamStatus;
};

const EMPTY_CHANNEL_CATALOG: ChannelCatalog = {};

let channelCache: ChannelCatalog | null = null;
let channelRequest: Promise<ChannelCatalog> | null = null;

function cacheChannels(channels: ChannelCatalog): ChannelCatalog {
  channelCache = channels;
  return channels;
}

async function loadNewsChannels(): Promise<ChannelCatalog> {
  try {
    const [channelsRes, streamsRes] = await Promise.all([
      fetch("https://iptv-org.github.io/api/channels.json"),
      fetch("https://iptv-org.github.io/api/streams.json"),
    ]);
    if (!channelsRes.ok || !streamsRes.ok) {
      return cacheChannels(EMPTY_CHANNEL_CATALOG);
    }
    const channels: RawChannel[] = await channelsRes.json();
    const streams: RawStream[] = await streamsRes.json();

    const streamUrlByChannel: Record<string, string> = Object.create(null);
    for (const stream of streams) {
      if (
        !stream.channel ||
        !stream.url ||
        stream.status === RawStreamStatus.Error
      ) {
        continue;
      }
      if (!Object.hasOwn(streamUrlByChannel, stream.channel)) {
        streamUrlByChannel[stream.channel] = stream.url;
      }
    }

    const channelById: Record<string, Channel> = Object.create(null);
    for (const channel of channels) {
      if (channel.is_nsfw) continue;
      const hasNews = channel.categories?.some(
        (category) =>
          category.toLowerCase() === "news" ||
          category.toLowerCase() === "general",
      );
      if (!hasNews) continue;
      const url = streamUrlByChannel[channel.id];
      if (!url) continue;
      channelById[channel.id] = {
        id: channel.id,
        name: channel.name,
        logo: channel.logo,
        url,
        country: channel.country ?? "",
        languages: channel.languages ?? [],
        featured: checkFeatured(channel.name),
      };
    }
    const sortedChannels = Object.values(channelById).sort((left, right) => {
      if (left.featured !== right.featured) return left.featured ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
    return cacheChannels(
      Object.fromEntries(
        sortedChannels.map((channel) => [channel.id, channel]),
      ),
    );
  } catch {
    return cacheChannels(EMPTY_CHANNEL_CATALOG);
  }
}

export function fetchNewsChannels(): Promise<ChannelCatalog> {
  if (channelCache) return Promise.resolve(channelCache);
  channelRequest ??= loadNewsChannels();
  return channelRequest;
}
