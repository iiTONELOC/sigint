import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";
import type {
  Channel,
  GridLayout,
  SlotState,
  SavedSlot,
  SavedState,
  Preset,
} from "./videoFeedTypes";

const CACHE_KEY = CACHE_KEYS.videoState;
const PRESETS_KEY = CACHE_KEYS.videoPresets;

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
  cacheSet(CACHE_KEY, saved);
}

export async function loadState(): Promise<SavedState | null> {
  return await cacheGet<SavedState>(CACHE_KEY);
}

export async function loadPresets(): Promise<Preset[]> {
  return (await cacheGet<Preset[]>(PRESETS_KEY)) ?? [];
}

export function savePresets(presets: Preset[]) {
  cacheSet(PRESETS_KEY, presets);
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
