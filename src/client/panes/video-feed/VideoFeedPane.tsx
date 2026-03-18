import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  forwardRef,
} from "react";
import Hls from "hls.js";
import { cacheGet, cacheSet } from "@/lib/storageService";
import {
  Tv,
  LayoutGrid,
  Square,
  ChevronDown,
  X,
  Volume2,
  VolumeX,
  Loader2,
  AlertTriangle,
  Search,
  RefreshCw,
  Bookmark,
  Save,
  Trash2,
  Subtitles,
  Maximize,
  Minimize,
  Play,
  Pause,
  Radio,
  Scan,
  Pencil,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

type Channel = {
  id: string;
  name: string;
  logo: string | null;
  url: string;
  country: string;
  languages: string[];
  categories: string[];
  featured: boolean;
};

type GridLayout = 1 | 4 | 9;

type SlotState = {
  channel: Channel | null;
  error: boolean;
  loading: boolean;
};

// ── Featured channel detection ───────────────────────────────────────

const FEATURED_NAMES = [
  // US networks
  "abc news",
  "cbs news",
  "cbsn",
  "nbc news",
  "cnn",
  "fox news",
  "msnbc",
  "cnbc",
  "bloomberg",
  "reuters",
  "c-span",
  "cspan",
  "newsmax",
  "newsnation",
  "fox business",
  "fox weather",
  "abc news live",
  "cbs news 24",
  "nbc news now",
  "pbs newshour",
  "pbs",
  // UK
  "bbc news",
  "bbc world",
  "sky news",
  "gb news",
  // International English
  "al jazeera english",
  "france 24 english",
  "france 24 en",
  "dw english",
  "dw news",
  "euronews english",
  "euronews",
  "nhk world",
  "cgtn",
  "arirang",
  "trt world",
  "wion",
  "ndtv",
  "sky news australia",
  "abc news au",
  "i24 news",
  "cna",
  "al arabiya",
  "times now",
  "rt news",
  "globo news",
];

function checkFeatured(name: string): boolean {
  const n = name.toLowerCase().trim();
  return FEATURED_NAMES.some((f) => n === f || n.startsWith(f));
}

// ── Region mapping ───────────────────────────────────────────────────

type RegionKey =
  | "all"
  | "featured"
  | "us"
  | "americas"
  | "europe"
  | "mideast"
  | "asia"
  | "africa"
  | "oceania";

const REGIONS: { key: RegionKey; label: string }[] = [
  { key: "us", label: "US" },
  { key: "all", label: "ALL" },
  { key: "featured", label: "★ TOP" },
  { key: "americas", label: "AMER" },
  { key: "europe", label: "EUR" },
  { key: "mideast", label: "MENA" },
  { key: "asia", label: "ASIA" },
  { key: "africa", label: "AFR" },
  { key: "oceania", label: "OCE" },
];

function getRegion(country: string): RegionKey {
  const c = (country ?? "").toUpperCase();
  if (c === "US") return "us";
  const americas = new Set([
    "CA",
    "MX",
    "BR",
    "AR",
    "CL",
    "CO",
    "PE",
    "VE",
    "EC",
    "CU",
    "DO",
    "PR",
    "PA",
    "CR",
    "GT",
    "HN",
    "SV",
    "NI",
    "BO",
    "PY",
    "UY",
    "JM",
    "TT",
    "HT",
  ]);
  const europe = new Set([
    "GB",
    "UK",
    "FR",
    "DE",
    "IT",
    "ES",
    "PT",
    "NL",
    "BE",
    "AT",
    "CH",
    "SE",
    "NO",
    "DK",
    "FI",
    "PL",
    "CZ",
    "SK",
    "HU",
    "RO",
    "BG",
    "HR",
    "RS",
    "SI",
    "BA",
    "GR",
    "CY",
    "IE",
    "IS",
    "LT",
    "LV",
    "EE",
    "UA",
    "BY",
    "MD",
    "AL",
    "ME",
    "MK",
    "XK",
    "MT",
    "LU",
  ]);
  const mideast = new Set([
    "AE",
    "SA",
    "QA",
    "KW",
    "BH",
    "OM",
    "IQ",
    "IR",
    "SY",
    "LB",
    "JO",
    "PS",
    "IL",
    "YE",
    "EG",
    "LY",
    "TN",
    "DZ",
    "MA",
  ]);
  const asia = new Set([
    "CN",
    "JP",
    "KR",
    "IN",
    "PK",
    "BD",
    "LK",
    "NP",
    "MM",
    "TH",
    "VN",
    "PH",
    "MY",
    "SG",
    "ID",
    "KH",
    "LA",
    "TW",
    "HK",
    "MN",
    "KZ",
    "UZ",
    "KG",
    "TJ",
    "TM",
    "AF",
    "GE",
    "AM",
    "AZ",
    "TR",
  ]);
  const africa = new Set([
    "NG",
    "KE",
    "ZA",
    "GH",
    "ET",
    "TZ",
    "UG",
    "CI",
    "CM",
    "SN",
    "CD",
    "ML",
    "BF",
    "NE",
    "MZ",
    "MG",
    "AO",
    "ZW",
    "RW",
    "SD",
    "SS",
    "SO",
    "ER",
    "DJ",
    "MW",
    "ZM",
    "BW",
    "NA",
  ]);
  const oceania = new Set(["AU", "NZ", "FJ", "PG", "WS", "TO", "VU", "SB"]);
  if (americas.has(c)) return "americas";
  if (europe.has(c)) return "europe";
  if (mideast.has(c)) return "mideast";
  if (asia.has(c)) return "asia";
  if (africa.has(c)) return "africa";
  if (oceania.has(c)) return "oceania";
  return "all";
}

// ── Channel fetching ─────────────────────────────────────────────────

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

async function fetchNewsChannels(): Promise<Channel[]> {
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

// ── Player handle for parent to control playback ────────────────────

type PlayerHandle = {
  isPaused: boolean;
  isLive: boolean;
  currentDelay: number;
  play: () => void;
  pause: () => void;
  goLive: () => void;
};

const DVR_BACK_BUFFER = 300; // 5 min

// ── HLS Player ───────────────────────────────────────────────────────

function HlsPlayer({
  channel,
  muted,
  ccEnabled,
  onError,
  onLoaded,
  playerRef,
}: {
  readonly channel: Channel;
  readonly muted: boolean;
  readonly ccEnabled: boolean;
  readonly onError: () => void;
  readonly onLoaded: () => void;
  readonly playerRef?: React.MutableRefObject<PlayerHandle | null>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const errorFired = useRef(false);
  const [, tick] = useState(0);

  // Expose player handle
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playerRef) return;
    playerRef.current = {
      get isPaused() {
        return video.paused;
      },
      get isLive() {
        // For live HLS, duration is often Infinity — use buffered end as live edge
        if (!isFinite(video.duration)) {
          if (video.buffered.length === 0) return true;
          const liveEdge = video.buffered.end(video.buffered.length - 1);
          return liveEdge - video.currentTime < 3;
        }
        return video.duration - video.currentTime < 3;
      },
      get currentDelay() {
        if (!isFinite(video.duration)) {
          if (video.buffered.length === 0) return 0;
          const liveEdge = video.buffered.end(video.buffered.length - 1);
          return Math.max(0, liveEdge - video.currentTime);
        }
        return Math.max(0, video.duration - video.currentTime);
      },
      play() {
        video.play().catch(() => {});
        tick((n) => n + 1);
      },
      pause() {
        video.pause();
        tick((n) => n + 1);
      },
      goLive() {
        // Jump to live edge — works for both finite and Infinity duration
        if (video.buffered.length > 0) {
          video.currentTime = video.buffered.end(video.buffered.length - 1);
        } else if (isFinite(video.duration)) {
          video.currentTime = video.duration;
        }
        // If HLS.js is attached, use startLoad to resync
        if (hlsRef.current) {
          hlsRef.current.startLoad(-1);
        }
        video.play().catch(() => {});
        tick((n) => n + 1);
      },
    };
    // Periodic update for DVR time display
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      clearInterval(iv);
      if (playerRef) playerRef.current = null;
    };
  }, [playerRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    errorFired.current = false;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const fireError = () => {
      if (!errorFired.current) {
        errorFired.current = true;
        onError();
      }
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 10,
        maxMaxBufferLength: 30,
        backBufferLength: DVR_BACK_BUFFER,
      });
      hls.loadSource(channel.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        onLoaded();
        video.play().catch(() => {});
      });

      let networkRetries = 0;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            networkRetries < 2
          ) {
            networkRetries++;
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            fireError();
          }
        }
      });

      // Timeout — if nothing loads in 15s, mark as error
      const timeout = setTimeout(() => {
        if (!errorFired.current && video.readyState < 2) fireError();
      }, 15_000);

      hlsRef.current = hls;
      return () => {
        clearTimeout(timeout);
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = channel.url;
      const onMeta = () => {
        onLoaded();
        video.play().catch(() => {});
      };
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("error", fireError);
      const timeout = setTimeout(() => {
        if (!errorFired.current && video.readyState < 2) fireError();
      }, 15_000);
      return () => {
        clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("error", fireError);
        video.src = "";
      };
    }

    fireError();
  }, [channel.url]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // Show closed captions when enabled (if stream provides CC tracks)
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const update = () => {
      for (let i = 0; i < vid.textTracks.length; i++) {
        const track = vid.textTracks[i];
        if (track) track.mode = ccEnabled ? "showing" : "hidden";
      }
    };
    update();
    // Text tracks may load after the video — listen for additions
    vid.textTracks.addEventListener("addtrack", update);
    return () => vid.textTracks.removeEventListener("addtrack", update);
  }, [ccEnabled]);

  return (
    <video
      ref={videoRef}
      muted={muted}
      autoPlay
      playsInline
      className="w-full h-full object-contain bg-black"
    />
  );
}

// ── Channel Picker (virtual-scrolled) ────────────────────────────────

const PICKER_ROW = 44;
const PICKER_OVER = 8;

const ChannelPicker = forwardRef<
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

// ── Video Slot ───────────────────────────────────────────────────────

function formatDelay(seconds: number): string {
  if (seconds < 1) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `-${m}:${String(s).padStart(2, "0")}` : `-${s}s`;
}

function VideoSlot({
  slot,
  slotIdx,
  channels,
  onAssign,
  onClear,
  onSlotError,
  onSlotLoaded,
  muted,
  onToggleMute,
  gridSize,
  onPromote,
}: {
  readonly slot: SlotState;
  readonly slotIdx: number;
  readonly channels: Channel[];
  readonly onAssign: (idx: number, ch: Channel) => void;
  readonly onClear: (idx: number) => void;
  readonly onSlotError: (idx: number) => void;
  readonly onSlotLoaded: (idx: number) => void;
  readonly muted: boolean;
  readonly onToggleMute: (idx: number) => void;
  readonly gridSize: GridLayout;
  readonly onPromote?: (idx: number) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [ccEnabled, setCcEnabled] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerHandle | null>(null);
  const compact = gridSize > 1;

  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setShowPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  const handleFullscreen = useCallback(() => {
    const el = slotRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  // ── Empty slot ─────────────────────────────────────────────────
  if (!slot.channel) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-black/50 border border-sig-border/30 rounded overflow-hidden">
        <button
          onClick={() => setShowPicker(true)}
          className="flex flex-col items-center gap-2 text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
        >
          <Tv size={compact ? 20 : 28} strokeWidth={1.5} />
          <span className="text-(length:--sig-text-sm) tracking-wider">
            SELECT CHANNEL
          </span>
        </button>
        {showPicker && (
          <ChannelPicker
            ref={pickerRef}
            channels={channels}
            onSelect={(ch) => {
              onAssign(slotIdx, ch);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (slot.error) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center bg-black/80 border border-sig-border/30 rounded overflow-hidden gap-2">
        <AlertTriangle size={20} className="text-sig-danger" />
        <span className="text-sig-dim text-(length:--sig-text-sm)">
          {slot.channel.name} — stream unavailable
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAssign(slotIdx, slot.channel!)}
            className="flex items-center gap-1 px-2 py-1 rounded text-sig-accent text-(length:--sig-text-sm) bg-transparent border border-sig-accent/30 hover:bg-sig-accent/10 transition-colors"
          >
            <RefreshCw size={10} /> RETRY
          </button>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1 px-2 py-1 rounded text-sig-bright text-(length:--sig-text-sm) bg-transparent border border-sig-border hover:bg-sig-panel transition-colors"
          >
            <ChevronDown size={10} /> CHANGE
          </button>
          <button
            onClick={() => onClear(slotIdx)}
            className="flex items-center gap-1 px-2 py-1 rounded text-sig-dim text-(length:--sig-text-sm) bg-transparent border border-sig-border hover:text-sig-danger transition-colors"
          >
            <X size={10} /> CLOSE
          </button>
        </div>
        {showPicker && (
          <ChannelPicker
            ref={pickerRef}
            channels={channels}
            onSelect={(ch) => {
              onAssign(slotIdx, ch);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    );
  }

  // ── Playing / Loading state ────────────────────────────────────
  const player = playerRef.current;
  const isPaused = player?.isPaused ?? false;
  const isLive = player?.isLive ?? true;
  const delay = player?.currentDelay ?? 0;

  return (
    <div
      ref={slotRef}
      className="relative w-full h-full bg-black border border-sig-border/30 rounded overflow-hidden group"
    >
      {slot.loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/70">
          <Loader2 size={20} className="text-sig-accent animate-spin" />
        </div>
      )}

      <HlsPlayer
        channel={slot.channel}
        muted={muted}
        ccEnabled={ccEnabled}
        onError={() => onSlotError(slotIdx)}
        onLoaded={() => onSlotLoaded(slotIdx)}
        playerRef={playerRef}
      />

      {/* Controls — always visible on touch, hover-reveal on desktop */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity px-2 pt-4 pb-1.5">
        {/* DVR bar — shows when not live */}
        {!isLive && delay > 2 && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-yellow-400 text-[9px] font-semibold tracking-wider tabular-nums shrink-0">
              {formatDelay(delay)}
            </span>
            <div className="flex-1 h-0.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400/60 rounded-full"
                style={{
                  width: `${Math.max(2, 100 - (delay / DVR_BACK_BUFFER) * 100)}%`,
                }}
              />
            </div>
            <button
              onClick={() => player?.goLive()}
              className="text-yellow-400 text-[9px] font-bold tracking-wider bg-transparent border-none hover:text-white transition-colors shrink-0"
            >
              GO LIVE
            </button>
          </div>
        )}

        {/* Main control row */}
        <div className="flex items-center gap-1.5">
          {slot.channel.logo && (
            <img
              src={slot.channel.logo}
              alt=""
              className="w-4 h-4 rounded-sm object-contain bg-white/10 shrink-0"
              loading="lazy"
            />
          )}
          <span className="text-white text-(length:--sig-text-sm) font-semibold truncate flex-1 tracking-wide">
            {slot.channel.name}
          </span>

          {/* Live indicator */}
          {isLive && !isPaused && (
            <span className="flex items-center gap-0.5 text-sig-danger text-[8px] font-bold tracking-wider shrink-0">
              <Radio size={8} className="animate-[pulse_1.5s_infinite]" /> LIVE
            </span>
          )}

          {/* Pause/Play */}
          <button
            onClick={() => (isPaused ? player?.play() : player?.pause())}
            className="text-white/70 bg-transparent border-none hover:text-white transition-colors p-0.5"
            title={isPaused ? "Play" : "Pause (DVR buffer: 5 min)"}
          >
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
          </button>

          {/* Mute toggle — uses video.muted, simple and working */}
          <button
            onClick={() => onToggleMute(slotIdx)}
            className="text-white/70 bg-transparent border-none hover:text-white transition-colors p-0.5"
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>

          {/* CC */}
          <button
            onClick={() => setCcEnabled((v) => !v)}
            className={`bg-transparent border-none transition-colors p-0.5 ${ccEnabled ? "text-sig-accent" : "text-white/70 hover:text-white"}`}
            title={ccEnabled ? "Hide captions" : "Show captions"}
          >
            <Subtitles size={12} />
          </button>

          {/* Promote to 1×1 (only in grid mode) */}
          {onPromote && compact && (
            <button
              onClick={() => onPromote(slotIdx)}
              className="text-white/70 bg-transparent border-none hover:text-white transition-colors p-0.5"
              title="Focus this channel"
            >
              <Scan size={12} />
            </button>
          )}

          {/* Browser fullscreen */}
          <button
            onClick={handleFullscreen}
            className="text-white/70 bg-transparent border-none hover:text-white transition-colors p-0.5"
            title="Fullscreen"
          >
            <Maximize size={12} />
          </button>

          {/* Change channel */}
          <button
            onClick={() => setShowPicker(true)}
            className="text-white/70 bg-transparent border-none hover:text-white transition-colors p-0.5"
            title="Change channel"
          >
            <ChevronDown size={12} />
          </button>

          {/* Close */}
          <button
            onClick={() => onClear(slotIdx)}
            className="text-white/70 bg-transparent border-none hover:text-sig-danger transition-colors p-0.5"
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {compact && (
        <div className="absolute top-0 left-0 px-1.5 py-0.5 bg-black/60 rounded-br">
          <span className="text-white/80 text-[9px] tracking-wider font-semibold truncate max-w-20 block">
            {slot.channel.name}
          </span>
        </div>
      )}

      {showPicker && (
        <ChannelPicker
          ref={pickerRef}
          channels={channels}
          onSelect={(ch) => {
            onAssign(slotIdx, ch);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ── Persistence ──────────────────────────────────────────────────────

const CACHE_KEY = "sigint.videofeed.state.v1";
const PRESETS_KEY = "sigint.videofeed.presets.v1";

type SavedSlot = {
  channelId: string;
  channelName: string;
  url: string;
  logo: string | null;
  country: string;
} | null;
type SavedState = { grid: GridLayout; slots: SavedSlot[] };
type Preset = { name: string; state: SavedState };

function saveState(grid: GridLayout, slots: SlotState[]) {
  const saved: SavedState = {
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
  cacheSet(CACHE_KEY, saved);
}

function loadState(): SavedState | null {
  return cacheGet<SavedState>(CACHE_KEY);
}

function loadPresets(): Preset[] {
  return cacheGet<Preset[]>(PRESETS_KEY) ?? [];
}

function savePresets(presets: Preset[]) {
  cacheSet(PRESETS_KEY, presets);
}

function restoreChannels(saved: SavedSlot[], channels: Channel[]): SlotState[] {
  const chanMap = new Map(channels.map((c) => [c.id, c]));
  return saved.map((s) => {
    if (!s) return { channel: null, error: false, loading: false };
    // Try to find by ID first, then fallback to URL match
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

// ── Preset Menu ──────────────────────────────────────────────────────

function PresetMenu({
  presets,
  onLoad,
  onSave,
  onUpdate,
  onDelete,
  onClose,
}: {
  presets: Preset[];
  onLoad: (p: Preset) => void;
  onSave: (name: string) => void;
  onUpdate: (idx: number) => void;
  onDelete: (idx: number) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full z-30 mt-0.5 bg-sig-panel border border-sig-border/60 rounded shadow-lg py-1 min-w-48"
    >
      <div className="px-2 py-1 text-sig-dim text-[10px] tracking-wider font-semibold border-b border-sig-border/30">
        PRESETS
      </div>
      {presets.length === 0 && (
        <div className="px-2 py-2 text-sig-dim text-(length:--sig-text-sm)">
          No saved presets
        </div>
      )}
      {presets.map((p, i) => (
        <div
          key={i}
          className="flex items-center gap-1 px-2 py-1 hover:bg-sig-accent/10 transition-colors"
        >
          <button
            onClick={() => {
              onLoad(p);
              onClose();
            }}
            className="flex-1 text-left text-sig-bright text-(length:--sig-text-md) bg-transparent border-none truncate"
          >
            {p.name}
            <span className="text-sig-dim ml-1">
              ({p.state.grid === 1 ? "1" : p.state.grid === 4 ? "2×2" : "3×3"})
            </span>
          </button>
          <button
            title="Update with current channels"
            onClick={() => onUpdate(i)}
            className="text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors p-0.5 shrink-0"
          >
            <Pencil size={10} />
          </button>
          <button
            title="Delete preset"
            onClick={() => onDelete(i)}
            className="text-sig-dim bg-transparent border-none hover:text-sig-danger transition-colors p-0.5 shrink-0"
          >
            <Trash2 size={10} />
          </button>
        </div>
      ))}
      <div className="border-t border-sig-border/30 mt-1 pt-1 px-2 flex items-center gap-1">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Preset name..."
          className="flex-1 bg-transparent outline-none text-sig-bright text-(length:--sig-text-md) min-w-0 caret-sig-accent"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              onSave(newName.trim());
              setNewName("");
              onClose();
            }
          }}
        />
        <button
          onClick={() => {
            if (newName.trim()) {
              onSave(newName.trim());
              setNewName("");
              onClose();
            }
          }}
          className="text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors p-0.5 shrink-0"
          title="Save current as preset"
        >
          <Save size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function VideoFeedPane() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPresets, setShowPresets] = useState(false);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const paneRef = useRef<HTMLDivElement>(null);

  // Restore saved state or default
  const savedState = useMemo(() => loadState(), []);
  const [gridLayout, setGridLayout] = useState<GridLayout>(
    savedState?.grid ?? 1,
  );
  const [slots, setSlots] = useState<SlotState[]>(() => {
    if (savedState?.slots) {
      return savedState.slots.map(
        () => ({ channel: null, error: false, loading: false }) as SlotState,
      );
    }
    return [{ channel: null, error: false, loading: false }];
  });
  const [mutedSlot, setMutedSlot] = useState<number | null>(null);
  const restoredRef = useRef(false);

  // ── Promote: temporarily show one slot as 1×1 ──────────────────
  const [promotedIdx, setPromotedIdx] = useState<number | null>(null);
  const [prePromoteGrid, setPrePromoteGrid] = useState<GridLayout | null>(null);

  const handlePromote = useCallback(
    (idx: number) => {
      setPrePromoteGrid(gridLayout);
      setPromotedIdx(idx);
    },
    [gridLayout],
  );

  const handleRestoreGrid = useCallback(() => {
    setPromotedIdx(null);
    setPrePromoteGrid(null);
  }, []);

  const handlePaneFullscreen = useCallback(() => {
    const el = paneRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  // Fetch channels, then restore saved slots
  useEffect(() => {
    fetchNewsChannels().then((chs) => {
      setChannels(chs);
      setLoading(false);
      // Restore saved channels once channel list is available
      if (savedState?.slots && !restoredRef.current) {
        restoredRef.current = true;
        const restored = restoreChannels(savedState.slots, chs);
        setSlots(restored);
      }
    });
  }, []);

  // Adjust slot count when grid changes
  useEffect(() => {
    setSlots((prev) => {
      const needed = gridLayout;
      if (prev.length === needed) return prev;
      if (prev.length < needed) {
        return [
          ...prev,
          ...Array.from({ length: needed - prev.length }, () => ({
            channel: null as Channel | null,
            error: false,
            loading: false,
          })),
        ];
      }
      return prev.slice(0, needed);
    });
  }, [gridLayout]);

  // Auto-save whenever slots or grid change
  useEffect(() => {
    const hasContent = slots.some((s) => s.channel !== null);
    if (!restoredRef.current && !hasContent) return;
    saveState(gridLayout, slots);
  }, [gridLayout, slots]);

  const assignChannel = useCallback(
    (idx: number, ch: Channel) => {
      setSlots((prev) => {
        const next = [...prev];
        if (next[idx]) next[idx] = { channel: ch, error: false, loading: true };
        return next;
      });
      if (gridLayout === 1) setMutedSlot(0);
    },
    [gridLayout],
  );

  const clearSlot = useCallback((idx: number) => {
    setSlots((prev) => {
      const next = [...prev];
      if (next[idx])
        next[idx] = { channel: null, error: false, loading: false };
      return next;
    });
  }, []);

  const slotError = useCallback((idx: number) => {
    setSlots((prev) => {
      const next = [...prev];
      if (next[idx]) next[idx] = { ...next[idx]!, error: true, loading: false };
      return next;
    });
  }, []);

  const slotLoaded = useCallback((idx: number) => {
    setSlots((prev) => {
      const next = [...prev];
      if (next[idx])
        next[idx] = { ...next[idx]!, loading: false, error: false };
      return next;
    });
  }, []);

  const toggleMute = useCallback((idx: number) => {
    setMutedSlot((prev) => (prev === idx ? null : idx));
  }, []);

  // Preset handlers
  const handleSavePreset = useCallback(
    (name: string) => {
      const state: SavedState = {
        grid: gridLayout,
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
      const updated = [...presets, { name, state }];
      setPresets(updated);
      savePresets(updated);
    },
    [gridLayout, slots, presets],
  );

  const handleLoadPreset = useCallback(
    (preset: Preset) => {
      setGridLayout(preset.state.grid);
      const restored = restoreChannels(preset.state.slots, channels);
      // Pad or trim to match grid
      const needed = preset.state.grid;
      if (restored.length < needed) {
        while (restored.length < needed)
          restored.push({ channel: null, error: false, loading: false });
      }
      setSlots(restored.slice(0, needed));
    },
    [channels],
  );

  const handleDeletePreset = useCallback(
    (idx: number) => {
      const updated = presets.filter((_, i) => i !== idx);
      setPresets(updated);
      savePresets(updated);
    },
    [presets],
  );

  const handleUpdatePreset = useCallback(
    (idx: number) => {
      const state: SavedState = {
        grid: gridLayout,
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
      const updated = presets.map((p, i) => (i === idx ? { ...p, state } : p));
      setPresets(updated);
      savePresets(updated);
    },
    [gridLayout, slots, presets],
  );

  const gridClass = useMemo(() => {
    if (promotedIdx !== null) return "grid-cols-1 grid-rows-1";
    switch (gridLayout) {
      case 1:
        return "grid-cols-1 grid-rows-1";
      case 4:
        return "grid-cols-2 grid-rows-2";
      case 9:
        return "grid-cols-3 grid-rows-3";
    }
  }, [gridLayout, promotedIdx]);

  const visibleSlots = useMemo(() => {
    if (promotedIdx !== null && slots[promotedIdx]) {
      return [{ slot: slots[promotedIdx]!, idx: promotedIdx }];
    }
    return slots.map((slot, idx) => ({ slot, idx }));
  }, [slots, promotedIdx]);

  return (
    <div
      ref={paneRef}
      className="w-full h-full flex flex-col bg-black overflow-hidden"
    >
      <div className="shrink-0 flex items-center justify-end gap-1.5 px-2 py-1 border-b border-sig-border/40 bg-sig-panel/80 relative">
        {/* Restore grid button */}
        {promotedIdx !== null && (
          <button
            onClick={handleRestoreGrid}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-accent text-(length:--sig-text-sm) font-semibold tracking-wider bg-sig-accent/10 border border-sig-accent/30 hover:bg-sig-accent/20 transition-colors mr-auto"
          >
            <Minimize size={10} strokeWidth={2.5} />
            RESTORE{" "}
            {prePromoteGrid === 4
              ? "2×2"
              : prePromoteGrid === 9
                ? "3×3"
                : "GRID"}
          </button>
        )}

        <div className="flex items-center gap-0.5">
          {([1, 4, 9] as GridLayout[]).map((g) => (
            <button
              key={g}
              onClick={() => {
                setGridLayout(g);
                setPromotedIdx(null);
                setPrePromoteGrid(null);
              }}
              className={`p-1 rounded transition-colors border-none ${
                gridLayout === g
                  ? "text-sig-accent bg-sig-accent/15"
                  : "text-sig-dim bg-transparent hover:text-sig-bright"
              }`}
              title={g === 1 ? "Single" : g === 4 ? "2×2" : "3×3"}
            >
              {g === 1 ? (
                <Square size={12} strokeWidth={2.5} />
              ) : g === 4 ? (
                <LayoutGrid size={12} strokeWidth={2.5} />
              ) : (
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="1" y="1" width="6" height="6" />
                  <rect x="9" y="1" width="6" height="6" />
                  <rect x="17" y="1" width="6" height="6" />
                  <rect x="1" y="9" width="6" height="6" />
                  <rect x="9" y="9" width="6" height="6" />
                  <rect x="17" y="9" width="6" height="6" />
                  <rect x="1" y="17" width="6" height="6" />
                  <rect x="9" y="17" width="6" height="6" />
                  <rect x="17" y="17" width="6" height="6" />
                </svg>
              )}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-sig-border/50" />
        {/* Presets button */}
        <button
          onClick={() => setShowPresets((v) => !v)}
          className={`p-1 rounded transition-colors border-none ${
            showPresets
              ? "text-sig-accent bg-sig-accent/15"
              : "text-sig-dim bg-transparent hover:text-sig-bright"
          }`}
          title="Presets"
        >
          <Bookmark size={12} strokeWidth={2.5} />
        </button>
        <span className="text-sig-dim text-(length:--sig-text-sm)">
          {loading ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            `${channels.length} ch`
          )}
        </span>
        <div className="w-px h-4 bg-sig-border/50" />
        <button
          onClick={handlePaneFullscreen}
          className="p-1 rounded text-sig-dim bg-transparent border-none hover:text-sig-bright transition-colors"
          title="Fullscreen pane"
        >
          <Maximize size={12} strokeWidth={2.5} />
        </button>
        {showPresets && (
          <PresetMenu
            presets={presets}
            onLoad={handleLoadPreset}
            onSave={handleSavePreset}
            onUpdate={handleUpdatePreset}
            onDelete={handleDeletePreset}
            onClose={() => setShowPresets(false)}
          />
        )}
      </div>

      <div className={`flex-1 grid ${gridClass} gap-0.5 p-0.5 min-h-0`}>
        {visibleSlots.map(({ slot, idx }) => (
          <VideoSlot
            key={`slot-${idx}`}
            slot={slot}
            slotIdx={idx}
            channels={channels}
            onAssign={assignChannel}
            onClear={clearSlot}
            onSlotError={slotError}
            onSlotLoaded={slotLoaded}
            muted={mutedSlot !== idx}
            onToggleMute={toggleMute}
            gridSize={promotedIdx !== null ? 1 : gridLayout}
            onPromote={gridLayout > 1 ? handlePromote : undefined}
          />
        ))}
      </div>
    </div>
  );
}
