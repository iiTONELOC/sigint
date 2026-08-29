import {
  useState,
  useEffect,
  useMemo,
  forwardRef,
  type ForwardedRef,
} from "react";
import { Search, X, Tv } from "lucide-react";
import { ButtonType } from "@/lib/ui/button";
import { DomInputType } from "@/runtime";
import { useVirtualScroll } from "@/virtual-scroll";
import type { Channel, ChannelCatalog } from "./videoFeedTypes";
import { getRegion, RegionKey } from "./videoFeedTypes";

enum ChannelPickerMetric {
  FallbackIconSize = 16,
  FallbackIconStrokeWidth = 1.5,
  IconSize = 12,
  IconStrokeWidth = 2.5,
  OverscanRows = 8,
  RowHeight = 44,
}

const CHANNEL_PICKER_DIMMED_ICON_CLASS = "text-sig-dim shrink-0";

type ChannelPickerProps = Readonly<{
  channels: ChannelCatalog;
  onSelect: (channel: Channel) => void;
  onClose: () => void;
}>;

function ChannelPickerView(
  { channels, onSelect, onClose }: ChannelPickerProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState(RegionKey.UnitedStates);

  const filtered = useMemo(() => {
    let list = Object.values(channels);
    if (region === RegionKey.Featured) {
      list = list.filter((channel) => channel.featured);
    } else if (region === RegionKey.Americas) {
      list = list.filter((channel) => {
        const channelRegion = getRegion(channel.country);
        return (
          channelRegion === RegionKey.UnitedStates ||
          channelRegion === RegionKey.Americas
        );
      });
    } else if (region !== RegionKey.All) {
      list = list.filter((channel) => getRegion(channel.country) === region);
    }
    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (channel) =>
          channel.name.toLowerCase().includes(query) ||
          channel.country.toLowerCase().includes(query) ||
          channel.languages.some((language) =>
            language.toLowerCase().includes(query),
          ),
      );
    }
    return list;
  }, [channels, search, region]);

  const {
    endIdx,
    offsetY,
    onScroll,
    scrollRef,
    scrollToTop,
    startIdx,
    totalHeight,
  } = useVirtualScroll({
    itemCount: filtered.length,
    overscan: ChannelPickerMetric.OverscanRows,
    rowHeight: ChannelPickerMetric.RowHeight,
  });
  const visible = useMemo(
    () => filtered.slice(startIdx, endIdx),
    [endIdx, filtered, startIdx],
  );

  useEffect(() => {
    scrollToTop();
  }, [region, scrollToTop, search]);

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-(--layer-pane-overlay) bg-sig-panel/98 backdrop-blur-sm flex flex-col overflow-hidden"
    >
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-b border-sig-border/40">
        <Search
          size={ChannelPickerMetric.IconSize}
          strokeWidth={ChannelPickerMetric.IconStrokeWidth}
          className={CHANNEL_PICKER_DIMMED_ICON_CLASS}
        />
        <input
          type={DomInputType.Text}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Search channels..."
          className="bg-transparent flex-1 min-w-0 text-sig-bright text-(length:--sig-text-md) caret-sig-accent"
          autoFocus
        />
        <span className="text-sig-dim text-(length:--sig-text-sm) shrink-0">
          {filtered.length}
        </span>
        <button
          type={ButtonType.Button}
          title="Close channel picker"
          onClick={onClose}
          className="text-sig-dim bg-transparent border-none hover:text-sig-bright transition-colors p-0"
        >
          <X
            size={ChannelPickerMetric.IconSize}
            strokeWidth={ChannelPickerMetric.IconStrokeWidth}
          />
        </button>
      </div>
      <div className="shrink-0 flex items-center gap-0.5 px-2 py-1 border-b border-sig-border/30 overflow-x-auto sigint-scroll">
        {Object.values(RegionKey).map((regionKey) => (
          <button
            type={ButtonType.Button}
            key={regionKey}
            onClick={() => setRegion(regionKey)}
            className={`px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wider font-semibold shrink-0 transition-colors border ${
              region === regionKey
                ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
                : "text-sig-dim bg-transparent border-sig-border/40 hover:text-sig-bright"
            }`}
          >
            {regionKey}
          </button>
        ))}
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto sigint-scroll"
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <div style={{ position: "absolute", top: offsetY, left: 0, right: 0 }}>
            {visible.map((channel) => (
              <button
                type={ButtonType.Button}
                key={channel.id}
                onClick={() => onSelect(channel)}
                className="w-full text-left px-2 flex items-center gap-2 bg-transparent border-none border-b border-sig-border/15 hover:bg-sig-accent/10 transition-colors"
                style={{ height: ChannelPickerMetric.RowHeight }}
              >
                {channel.logo ? (
                  <img
                    src={channel.logo}
                    alt=""
                    loading="lazy"
                    className="w-6 h-6 rounded-sm object-contain bg-white/10 shrink-0"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <Tv
                    size={ChannelPickerMetric.FallbackIconSize}
                    className={CHANNEL_PICKER_DIMMED_ICON_CLASS}
                    strokeWidth={ChannelPickerMetric.FallbackIconStrokeWidth}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sig-bright text-(length:--sig-text-md) truncate">
                      {channel.name}
                    </span>
                    {channel.featured && (
                      <span className="text-sig-accent text-(length:--sig-text-xs)">
                        ★
                      </span>
                    )}
                  </div>
                  <div className="text-sig-dim text-(length:--sig-text-sm) truncate">
                    {channel.country}
                    {channel.languages.length > 0
                      ? ` · ${channel.languages[0]}`
                      : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-20 text-sig-dim text-(length:--sig-text-sm)">
            {search
              ? `No results for "${search}"`
              : "No channels in this region"}
          </div>
        )}
      </div>
    </div>
  );
}

export const ChannelPicker = forwardRef<HTMLDivElement, ChannelPickerProps>(
  ChannelPickerView,
);
