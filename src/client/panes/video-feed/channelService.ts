import { authenticatedFetch } from "@/lib/net/authService";
import {
  VIDEO_CHANNELS_ROUTE,
  type ChannelCatalog,
} from "@shared/domain/videoChannel";

type ChannelsResponse = Readonly<{ channels: ChannelCatalog; probed: boolean }>;

const EMPTY_CHANNEL_CATALOG: ChannelCatalog = {};

let channelCache: ChannelCatalog | null = null;
let channelRequest: Promise<ChannelCatalog> | null = null;

async function loadNewsChannels(): Promise<ChannelCatalog> {
  try {
    const response = await authenticatedFetch(VIDEO_CHANNELS_ROUTE);
    if (!response.ok) return EMPTY_CHANNEL_CATALOG;
    const body = (await response.json()) as ChannelsResponse;
    if (body.probed) channelCache = body.channels;
    return body.channels;
  } catch {
    return EMPTY_CHANNEL_CATALOG;
  } finally {
    channelRequest = null;
  }
}

export function fetchNewsChannels(): Promise<ChannelCatalog> {
  if (channelCache) return Promise.resolve(channelCache);
  channelRequest ??= loadNewsChannels();
  return channelRequest;
}

export function __resetChannelCacheForTests(): void {
  channelCache = null;
  channelRequest = null;
}
