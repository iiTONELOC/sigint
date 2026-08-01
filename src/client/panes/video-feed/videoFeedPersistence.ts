import { cacheGet, cacheSet } from "@/lib/cache";
import { CacheKey } from "@shared/domain/cache";
import type {
  Channel,
  GridLayout,
  SlotState,
  SavedSlot,
  SavedState,
  Preset,
} from "./videoFeedTypes";

export function saveState(
  grid: GridLayout,
  slots: SlotState[],
  unmutedSlot?: number | null,
) {
  const saved: SavedState = {
    grid,
    unmutedSlot: unmutedSlot ?? null,
    slots: slots.map((s) =>
      s.channel
        ? {
            channelId: s.channel.id,
            channelName: s.channel.name,
            url: s.channel.url,
            logo: s.channel.logo,
            country: s.channel.country,
          }
        : null,
    ),
  };
  cacheSet(CacheKey.VideoState, saved);
}

export async function loadState(): Promise<SavedState | null> {
  return await cacheGet<SavedState>(CacheKey.VideoState);
}

export async function loadPresets(): Promise<Preset[]> {
  return (await cacheGet<Preset[]>(CacheKey.VideoPresets)) ?? [];
}

export function savePresets(presets: Preset[]) {
  cacheSet(CacheKey.VideoPresets, presets);
}

export function restoreChannels(
  saved: SavedSlot[],
  channels: Channel[],
): SlotState[] {
  const chanMap = new Map(channels.map((c) => [c.id, c]));
  return saved.map((s) => {
    if (!s) return { channel: null, error: false, loading: false };
    const ch =
      chanMap.get(s.channelId) ?? channels.find((c) => c.url === s.url);
    if (ch) return { channel: ch, error: false, loading: false };
    // Reconstruct minimal channel from saved data
    return {
      channel: {
        id: s.channelId,
        name: s.channelName,
        url: s.url,
        logo: s.logo,
        country: s.country,
        languages: [],
        categories: [],
        featured: false,
      },
      error: false,
      loading: false,
    };
  });
}

export function buildSavedState(
  grid: GridLayout,
  slots: SlotState[],
): SavedState {
  return {
    grid,
    slots: slots.map((s) =>
      s.channel
        ? {
            channelId: s.channel.id,
            channelName: s.channel.name,
            url: s.channel.url,
            logo: s.channel.logo,
            country: s.channel.country,
          }
        : null,
    ),
  };
}
