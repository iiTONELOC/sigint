import { useState, useEffect, useRef, useCallback, useMemo, forwardRef } from "react";
import { Search, X, Tv } from "lucide-react";
import type { Channel, RegionKey } from "./videoFeedTypes";
import { REGIONS, getRegion } from "./videoFeedTypes";

const PICKER_ROW = 44;
const PICKER_OVER = 8;

export const ChannelPicker = forwardRef<
  HTMLDivElement,
  { channels: Channel[]; onSelect: (ch: Channel) => void; onClose: () => void }
>(function ChannelPicker({ channels, onSelect, onClose }, ref) {
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState<RegionKey>("us");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(400);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const obs = new ResizeObserver((e) => {
      for (const en of e) setViewH(en.contentRect.height);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  const filtered = useMemo(() => {
    let list = channels;
    if (region === "featured") list = list.filter((ch) => ch.featured);
    else if (region === "americas")
      list = list.filter((ch) => {
        const r = getRegion(ch.country);
        return r === "us" || r === "americas";
      });
    else if (region !== "all")
      list = list.filter((ch) => getRegion(ch.country) === region);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (ch) =>
          ch.name.toLowerCase().includes(q) ||
          ch.country.toLowerCase().includes(q) ||
          ch.languages.some((l) => l.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [channels, search, region]);

  const totalH = filtered.length * PICKER_ROW;
  const si = Math.max(0, Math.floor(scrollTop / PICKER_ROW) - PICKER_OVER);
  const ei = Math.min(
    filtered.length,
    Math.ceil((scrollTop + viewH) / PICKER_ROW) + PICKER_OVER,
  );
  const offY = si * PICKER_ROW;
  const visible = useMemo(() => filtered.slice(si, ei), [filtered, si, ei]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [region, search]);

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-20 bg-sig-panel/98 backdrop-blur-sm flex flex-col overflow-hidden"
    >
      {/* Search */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-b border-sig-border/40">
        <Search size={12} strokeWidth={2.5} className="text-sig-dim shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search channels..."
          className="bg-transparent outline-none flex-1 min-w-0 text-sig-bright text-(length:--sig-text-md) caret-sig-accent"
          autoFocus
        />
        <span className="text-sig-dim text-(length:--sig-text-sm) shrink-0">
          {filtered.length}
        </span>
        <button
          title="close"
          onClick={onClose}
          className="text-sig-dim bg-transparent border-none hover:text-sig-bright transition-colors p-0"
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>
      {/* Region tabs */}
      <div className="shrink-0 flex items-center gap-0.5 px-2 py-1 border-b border-sig-border/30 overflow-x-auto sigint-scroll">
        {REGIONS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRegion(r.key)}
            className={`px-1.5 py-0.5 rounded text-[10px] tracking-wider font-semibold shrink-0 transition-colors border ${
              region === r.key
                ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
                : "text-sig-dim bg-transparent border-sig-border/40 hover:text-sig-bright"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {/* Virtual list */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto sigint-scroll"
      >
        <div style={{ height: totalH, position: "relative" }}>
          <div style={{ position: "absolute", top: offY, left: 0, right: 0 }}>
            {visible.map((ch) => (
              <button
                key={ch.id}
                onClick={() => onSelect(ch)}
                className="w-full text-left px-2 flex items-center gap-2 bg-transparent border-none border-b border-sig-border/15 hover:bg-sig-accent/10 transition-colors"
                style={{ height: PICKER_ROW }}
              >
                {ch.logo ? (
                  <img
                    src={ch.logo}
                    alt=""
                    loading="lazy"
                    className="w-6 h-6 rounded-sm object-contain bg-white/10 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <Tv
                    size={16}
                    className="text-sig-dim shrink-0"
                    strokeWidth={1.5}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sig-bright text-(length:--sig-text-md) truncate">
                      {ch.name}
                    </span>
                    {ch.featured && (
                      <span className="text-sig-accent text-[8px]">★</span>
                    )}
                  </div>
                  <div className="text-sig-dim text-(length:--sig-text-sm) truncate">
                    {ch.country}
                    {ch.languages.length > 0 ? ` · ${ch.languages[0]}` : ""}
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
});
