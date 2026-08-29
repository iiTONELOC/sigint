import { cacheGet, cacheSet } from "@/lib/cache";
import { CacheKey } from "@shared/domain/cache";
import type {
  Channel,
  ChannelCatalog,
  GridLayout,
  SlotState,
  SavedSlot,
  SavedState,
  Preset,
  PresetCatalog,
} from "./videoFeedTypes";
import { EMPTY_VIDEO_SLOT_STATE } from "./videoFeedTypes";

const PRESET_KEY_PREFIX = "preset:";

function serializeSlots(slots: readonly SlotState[]): SavedSlot[] {
  return slots.map(({ channel }) =>
    channel
      ? {
          channelId: channel.id,
          channelName: channel.name,
          url: channel.url,
          logo: channel.logo,
          country: channel.country,
        }
      : null,
  );
}

export function saveState(
  grid: GridLayout,
  slots: readonly SlotState[],
  unmutedSlot?: number | null,
): void {
  const saved: SavedState = {
    grid,
    unmutedSlot: unmutedSlot ?? null,
    slots: serializeSlots(slots),
  };
  cacheSet(CacheKey.VideoState, saved);
}

export async function loadState(): Promise<SavedState | null> {
  return await cacheGet<SavedState>(CacheKey.VideoState);
}

function nextPresetKey(
  presets: PresetCatalog,
  name: string,
): string {
  const baseKey = `${PRESET_KEY_PREFIX}${name}`;
  let key = baseKey;
  let occurrence = 2;
  while (Object.hasOwn(presets, key)) {
    key = `${baseKey}:${occurrence}`;
    occurrence += 1;
  }
  return key;
}

export async function loadPresets(): Promise<PresetCatalog> {
  const storedPresets =
    (await cacheGet<Preset[]>(CacheKey.VideoPresets)) ?? [];
  const presets: Record<string, Preset> = Object.create(null);
  for (const preset of storedPresets) {
    presets[nextPresetKey(presets, preset.name)] = preset;
  }
  return presets;
}

export function addPreset(
  presets: PresetCatalog,
  preset: Preset,
): PresetCatalog {
  return { ...presets, [nextPresetKey(presets, preset.name)]: preset };
}

export function savePresets(presets: PresetCatalog): void {
  cacheSet(CacheKey.VideoPresets, Object.values(presets));
}

export function restoreChannels(
  saved: readonly SavedSlot[],
  channels: ChannelCatalog,
): SlotState[] {
  const channelsByUrl: Record<string, Channel> = Object.create(null);
  for (const channel of Object.values(channels)) {
    if (!Object.hasOwn(channelsByUrl, channel.url)) {
      channelsByUrl[channel.url] = channel;
    }
  }
  return saved.map((savedSlot) => {
    if (!savedSlot) return EMPTY_VIDEO_SLOT_STATE;
    const channel =
      channels[savedSlot.channelId] ?? channelsByUrl[savedSlot.url];
    if (channel) return { channel, error: false, loading: false };
    return {
      channel: {
        id: savedSlot.channelId,
        name: savedSlot.channelName,
        url: savedSlot.url,
        logo: savedSlot.logo,
        country: savedSlot.country,
        languages: [],
        featured: false,
      },
      error: false,
      loading: false,
    };
  });
}

export function buildSavedState(
  grid: GridLayout,
  slots: readonly SlotState[],
): SavedState {
  return {
    grid,
    slots: serializeSlots(slots),
  };
}
