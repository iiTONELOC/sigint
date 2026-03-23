import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Sun,
  Moon,
  Trash2,
  HardDriveDownload,
  HardDriveUpload,
  Download,
  Upload,
  RotateCcw,
  Info,
  Database,
  Palette,
  Rss,
  Layout,
  ExternalLink,
  BookOpen,
  Smartphone,
  Monitor,
  MonitorSmartphone,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import {
  cacheListKeys,
  cacheEstimateSize,
  cacheDelete,
  cacheClearAll,
  cacheGet,
  cacheSet,
} from "@/lib/storageService";
import { CACHE_KEYS, CACHE_KEY_LABELS } from "@/lib/cacheKeys";
import {
  themes,
  LAYER_COLOR_KEYS,
  LAYER_COLOR_LABELS,
  type LayerColorKey,
} from "@/config/theme";
import { requestWalkthroughLaunch } from "@/panes/paneLayoutContext";
import {
  useLayoutMode,
  type LayoutMode as LayoutModeType,
} from "@/context/LayoutModeContext";

// ── Helpers ──────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getKeyLabel(key: string): string {
  return CACHE_KEY_LABELS[key]?.label ?? key;
}

// ── Tabs ─────────────────────────────────────────────────────────────

type Tab = "appearance" | "news" | "walkthrough" | "storage" | "about";

const TABS: { key: Tab; label: string; icon: typeof Palette }[] = [
  { key: "appearance", label: "APPEARANCE", icon: Palette },
  { key: "news", label: "NEWS FEEDS", icon: Rss },
  { key: "walkthrough", label: "WALKTHROUGH", icon: BookOpen },
  { key: "storage", label: "STORAGE", icon: Database },
  { key: "about", label: "ABOUT", icon: Info },
];

// ── Component ────────────────────────────────────────────────────────

export function SettingsModal({ onClose }: { readonly onClose: () => void }) {
  const {
    mode,
    resolvedMode,
    setMode,
    colorOverrides,
    setLayerColor,
    resetLayerColor,
    resetAllColors,
  } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>("appearance");
  const [storageKeys, setStorageKeys] = useState<string[]>([]);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Load storage info
  const refreshStorage = useCallback(async () => {
    const keys = await cacheListKeys();
    setStorageKeys(keys);
    const s: Record<string, number> = {};
    for (const k of keys) s[k] = await cacheEstimateSize(k);
    setSizes(s);
  }, []);

  useEffect(() => {
    refreshStorage();
  }, [refreshStorage]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose],
  );

  const handleDeleteKey = useCallback(
    async (key: string) => {
      await cacheDelete(key);
      refreshStorage();
    },
    [refreshStorage],
  );

  const handleClearAll = useCallback(async () => {
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      return;
    }
    await cacheClearAll();
    window.location.reload();
  }, [confirmClearAll]);

  const handleResetLayout = useCallback(async () => {
    await cacheDelete(CACHE_KEYS.layout);
    await cacheDelete(CACHE_KEYS.layoutDesktop);
    await cacheDelete(CACHE_KEYS.layoutMobile);
    await cacheDelete(CACHE_KEYS.layoutPresets);
    await cacheDelete(CACHE_KEYS.layoutPresetsDesktop);
    await cacheDelete(CACHE_KEYS.layoutPresetsMobile);
    refreshStorage();
    window.location.reload();
  }, [refreshStorage]);

  // ── Export all data as JSON file ────────────────────────────────
  const handleExport = useCallback(async () => {
    const allowedKeys = new Set(Object.values(CACHE_KEYS));
    const keys = (await cacheListKeys()).filter((k) =>
      allowedKeys.has(k as (typeof CACHE_KEYS)[keyof typeof CACHE_KEYS]),
    );
    const exportData: Record<string, unknown> = {};
    for (const key of keys) {
      const value = await cacheGet(key);
      if (value != null) exportData[key] = value;
    }
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sigint-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Import data from JSON file ─────────────────────────────────
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = reader.result as string;
          // Size guard — reject files over 50MB
          if (raw.length > 50 * 1024 * 1024) {
            setImportStatus("File too large (max 50MB)");
            return;
          }
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            setImportStatus("Invalid format — expected JSON object");
            return;
          }
          // Sanitize: only accept known sigint.* keys
          const allowedKeys = new Set(Object.values(CACHE_KEYS));
          let imported = 0;
          let skipped = 0;
          for (const [key, value] of Object.entries(parsed)) {
            if (
              !allowedKeys.has(
                key as (typeof CACHE_KEYS)[keyof typeof CACHE_KEYS],
              )
            ) {
              skipped++;
              continue;
            }
            if (value == null) {
              skipped++;
              continue;
            }
            cacheSet(key, value);
            imported++;
          }
          refreshStorage();
          setImportStatus(
            `Imported ${imported} key${imported !== 1 ? "s" : ""}${skipped > 0 ? `, skipped ${skipped}` : ""}`,
          );
          setTimeout(() => window.location.reload(), 1000);
        } catch {
          setImportStatus("Failed to parse JSON");
          setTimeout(() => setImportStatus(null), 4000);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [refreshStorage]);

  const totalSize = Object.values(sizes).reduce((a, b) => a + b, 0);

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ overscrollBehavior: "none", touchAction: "none" }}
    >
      <div
        className="bg-sig-panel sm:border sm:border-sig-border sm:rounded-lg shadow-2xl w-full h-full sm:w-auto sm:min-w-[28rem] sm:max-w-lg sm:mx-4 sm:h-auto sm:max-h-[85vh] flex flex-col overflow-hidden"
        style={{
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center px-3 sm:px-4 py-3 border-b border-sig-border/50">
          <span className="font-semibold tracking-widest text-sig-bright text-sm">
            SETTINGS
          </span>
          <button
            onClick={onClose}
            className="absolute right-3 sm:right-4 p-1.5 rounded text-sig-dim hover:text-sig-bright transition-colors"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-center flex-wrap gap-0.5 px-2 sm:px-4 pt-2 pb-0 border-b border-sig-border/30">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-semibold tracking-wider transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  active
                    ? "text-sig-accent border-sig-accent"
                    : "text-sig-dim border-transparent hover:text-sig-text"
                }`}
              >
                <Icon size={13} strokeWidth={2.5} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain sigint-scroll p-3 sm:p-4"
          style={{
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
          }}
        >
          {activeTab === "appearance" && (
            <AppearanceTab
              mode={mode}
              resolvedMode={resolvedMode}
              setMode={setMode}
              colorOverrides={colorOverrides}
              setLayerColor={setLayerColor}
              resetLayerColor={resetLayerColor}
              resetAllColors={resetAllColors}
            />
          )}
          {activeTab === "news" && <NewsFeedsTab />}
          {activeTab === "walkthrough" && <WalkthroughTab onClose={onClose} />}
          {activeTab === "storage" && (
            <StorageTab
              keys={storageKeys}
              sizes={sizes}
              totalSize={totalSize}
              onDelete={handleDeleteKey}
              onClearAll={handleClearAll}
              confirmClearAll={confirmClearAll}
              onResetLayout={handleResetLayout}
              onExport={handleExport}
              onImport={handleImport}
              importStatus={importStatus}
            />
          )}
          {activeTab === "about" && <AboutTab />}
        </div>
      </div>
    </div>
  );
}

// ── Appearance tab ───────────────────────────────────────────────────

function AppearanceTab({
  mode,
  resolvedMode,
  setMode,
  colorOverrides,
  setLayerColor,
  resetLayerColor,
  resetAllColors,
}: {
  mode: string;
  resolvedMode: "dark" | "light";
  setMode: (m: "dark" | "light" | "auto") => void;
  colorOverrides: {
    dark: Partial<Record<LayerColorKey, string>>;
    light: Partial<Record<LayerColorKey, string>>;
  };
  setLayerColor: (key: LayerColorKey, color: string) => void;
  resetLayerColor: (key: LayerColorKey) => void;
  resetAllColors: () => void;
}) {
  const modeKey = resolvedMode;
  const defaults = themes[modeKey].colors;
  const overrides = colorOverrides[modeKey];
  const hasAnyOverride = Object.keys(overrides).length > 0;

  // Ticker speed
  const [tickerSpeed, setTickerSpeed] = useState(10);

  useEffect(() => {
    cacheGet<number>(CACHE_KEYS.tickerSpeed).then((saved) => {
      if (typeof saved === "number") setTickerSpeed(saved);
    });
  }, []);
  const handleTickerSpeed = useCallback((val: number) => {
    setTickerSpeed(val);
    cacheSet(CACHE_KEYS.tickerSpeed, val);
  }, []);

  const speedLabel =
    tickerSpeed === 0
      ? "STOPPED"
      : tickerSpeed <= 25
        ? "SLOW"
        : tickerSpeed <= 60
          ? "NORMAL"
          : "FAST";

  return (
    <div className="space-y-5">
      {/* Theme toggle */}
      <div>
        <div className="text-xs text-sig-dim tracking-widest mb-3">THEME</div>
        <div className="flex gap-2">
          <button
            onClick={() => setMode("auto")}
            className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded border transition-all ${
              mode === "auto"
                ? "bg-sig-accent/10 border-sig-accent/40 text-sig-accent"
                : "bg-transparent border-sig-border/50 text-sig-dim hover:text-sig-text hover:border-sig-border"
            }`}
          >
            <MonitorSmartphone size={18} />
            <span className="text-[10px] font-semibold tracking-wider">AUTO</span>
          </button>
          <button
            onClick={() => setMode("dark")}
            className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded border transition-all ${
              mode === "dark"
                ? "bg-sig-accent/10 border-sig-accent/40 text-sig-accent"
                : "bg-transparent border-sig-border/50 text-sig-dim hover:text-sig-text hover:border-sig-border"
            }`}
          >
            <Moon size={18} />
            <span className="text-[10px] font-semibold tracking-wider">DARK</span>
          </button>
          <button
            onClick={() => setMode("light")}
            className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded border transition-all ${
              mode === "light"
                ? "bg-sig-accent/10 border-sig-accent/40 text-sig-accent"
                : "bg-transparent border-sig-border/50 text-sig-dim hover:text-sig-text hover:border-sig-border"
            }`}
          >
            <Sun size={18} />
            <span className="text-[10px] font-semibold tracking-wider">LIGHT</span>
          </button>
        </div>
      </div>

      {/* Ticker speed */}
      <div>
        <div className="text-xs text-sig-dim tracking-widest mb-3">
          LAYOUT MODE
        </div>
        <LayoutModeSelector />
      </div>

      {/* Ticker speed */}
      <div>
        <div className="text-xs text-sig-dim tracking-widest mb-3">
          LIVE FEED TICKER
        </div>
        <div className="flex items-center gap-3 px-2.5 py-2 rounded bg-sig-bg/30 border border-sig-border/20">
          <span className="text-sm text-sig-text font-semibold tracking-wider w-16 shrink-0">
            {speedLabel}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={tickerSpeed}
            onChange={(e) => handleTickerSpeed(Number(e.target.value))}
            className="flex-1 accent-sig-accent cursor-pointer"
            title={`Ticker speed: ${tickerSpeed} px/s`}
          />
          <span className="text-xs text-sig-dim tabular-nums w-10 text-right shrink-0">
            {tickerSpeed === 0 ? "OFF" : `${tickerSpeed}`}
          </span>
        </div>
        <div className="text-xs text-sig-dim/60 mt-1.5 leading-snug">
          Controls scroll speed of the live feed ticker. Set to 0 to stop
          scrolling (items swap periodically).
        </div>
      </div>

      {/* Layer colors */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-sig-dim tracking-widest">
            LAYER COLORS ({resolvedMode.toUpperCase()})
          </div>
          {hasAnyOverride && (
            <button
              onClick={resetAllColors}
              className="flex items-center gap-1 text-xs text-sig-dim hover:text-sig-accent transition-colors"
            >
              <RotateCcw size={10} />
              RESET ALL
            </button>
          )}
        </div>
        <div className="divide-y divide-gray-700">
          {LAYER_COLOR_KEYS.map((key) => {
            const defaultColor = defaults[key];
            const currentColor = overrides[key] ?? defaultColor;
            const isOverridden = key in overrides;

            return (
              <div
                key={key}
                className="flex items-center gap-3 px-2.5 py-2.5 rounded"
              >
                <label className="relative cursor-pointer shrink-0">
                  <input
                    type="color"
                    value={currentColor}
                    onChange={(e) => setLayerColor(key, e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    title={`Select color for ${LAYER_COLOR_LABELS[key]}`}
                  />
                  <div
                    className="w-8 h-8 rounded border-2 border-sig-border/40"
                    style={{ backgroundColor: currentColor }}
                  />
                </label>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-sig-text font-semibold tracking-wider">
                    {LAYER_COLOR_LABELS[key]}
                  </div>
                  <div className="text-xs text-sig-dim font-mono">
                    {currentColor.toUpperCase()}
                    {isOverridden && (
                      <span className="text-sig-accent ml-1.5">CUSTOM</span>
                    )}
                  </div>
                </div>
                {isOverridden && (
                  <button
                    onClick={() => resetLayerColor(key)}
                    className="p-1 rounded text-sig-dim hover:text-sig-accent transition-colors shrink-0"
                    title={`Reset to default (${defaultColor})`}
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Layout mode selector ─────────────────────────────────────────────

const LAYOUT_MODES: { key: LayoutModeType; label: string; icon: typeof Monitor; desc: string }[] = [
  { key: "auto", label: "AUTO", icon: MonitorSmartphone, desc: "Viewport width" },
  { key: "mobile", label: "MOBILE", icon: Smartphone, desc: "Force app layout" },
  { key: "desktop", label: "DESKTOP", icon: Monitor, desc: "Force pane layout" },
];

function LayoutModeSelector() {
  const { mode, setMode } = useLayoutMode();

  return (
    <div>
      <div className="flex gap-2">
        {LAYOUT_MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded border transition-all ${
                active
                  ? "bg-sig-accent/10 border-sig-accent/40 text-sig-accent"
                  : "bg-transparent border-sig-border/50 text-sig-dim hover:text-sig-text hover:border-sig-border"
              }`}
            >
              <Icon size={18} />
              <span className="text-[10px] font-semibold tracking-wider">{m.label}</span>
            </button>
          );
        })}
      </div>
      <div className="text-xs text-sig-dim/60 mt-1.5 leading-snug">
        {mode === "auto"
          ? "Layout switches automatically based on viewport width (768px breakpoint). iPads may render desktop layout."
          : mode === "mobile"
            ? "Mobile layout forced — vertical scrollable pane column, compact controls. Use on tablets for an app-like experience."
            : "Desktop layout forced — multi-pane split grid with drag, resize, and presets. Use on large tablets or narrow desktop windows."}
      </div>
    </div>
  );
}

// ── Storage tab ──────────────────────────────────────────────────────

function StorageTab({
  keys,
  sizes,
  totalSize,
  onDelete,
  onClearAll,
  confirmClearAll,
  onResetLayout,
  onExport,
  onImport,
  importStatus,
}: {
  keys: string[];
  sizes: Record<string, number>;
  totalSize: number;
  onDelete: (key: string) => void;
  onClearAll: () => void;
  confirmClearAll: boolean;
  onResetLayout: () => void;
  onExport: () => void;
  onImport: () => void;
  importStatus: string | null;
}) {
  const dataKeys = keys.filter((k) => CACHE_KEY_LABELS[k]?.group === "Data");
  const uiKeys = keys.filter((k) => CACHE_KEY_LABELS[k]?.group === "UI");
  const otherKeys = keys.filter((k) => !CACHE_KEY_LABELS[k]);

  return (
    <div className="space-y-5">
      {/* Summary + Export/Import */}
      <div className="flex items-center flex-wrap gap-2 justify-between">
        <div className="flex items-center gap-2 text-sig-dim text-xs tracking-wider">
          <HardDriveDownload size={13} />
          <span>
            {keys.length} keys · {formatBytes(totalSize)} total
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onExport}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-sig-dim border border-sig-border/50 hover:text-sig-accent hover:border-sig-accent/30 transition-colors"
            title="Export all data as JSON"
          >
            <Download size={12} />
            EXPORT
          </button>
          <button
            onClick={onImport}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-sig-dim border border-sig-border/50 hover:text-sig-accent hover:border-sig-accent/30 transition-colors"
            title="Import data from JSON backup"
          >
            <Upload size={12} />
            IMPORT
          </button>
        </div>
      </div>

      {/* Import status feedback */}
      {importStatus && (
        <div className="text-xs text-sig-accent bg-sig-accent/10 border border-sig-accent/20 rounded px-2.5 py-1.5">
          {importStatus}
        </div>
      )}

      {/* Data caches */}
      {dataKeys.length > 0 && (
        <KeyGroup
          label="DATA CACHES"
          keys={dataKeys}
          sizes={sizes}
          onDelete={onDelete}
        />
      )}

      {/* UI state */}
      {uiKeys.length > 0 && (
        <KeyGroup
          label="UI STATE"
          keys={uiKeys}
          sizes={sizes}
          onDelete={onDelete}
        />
      )}

      {/* Unknown keys */}
      {otherKeys.length > 0 && (
        <KeyGroup
          label="OTHER"
          keys={otherKeys}
          sizes={sizes}
          onDelete={onDelete}
        />
      )}

      {/* Layout reset */}
      <div className="pt-2 border-t border-sig-border/30">
        <button
          onClick={onResetLayout}
          className="flex items-center gap-2 px-3 py-2 rounded text-sm text-sig-dim border border-sig-border/50 hover:text-sig-text hover:border-sig-border transition-colors w-full"
        >
          <Layout size={14} />
          <span className="font-semibold tracking-wider">RESET LAYOUT</span>
          <span className="text-xs ml-auto opacity-60">Reloads page</span>
        </button>
      </div>

      {/* Clear all */}
      <div className="pt-2 border-t border-sig-border/30">
        <button
          onClick={onClearAll}
          className={`flex items-center gap-2 px-3 py-2 rounded text-sm w-full transition-all border ${
            confirmClearAll
              ? "text-sig-danger border-sig-danger/40 bg-sig-danger/10"
              : "text-sig-dim border-sig-border/50 hover:text-sig-text hover:border-sig-border"
          }`}
        >
          <Trash2 size={14} />
          <span className="font-semibold tracking-wider">
            {confirmClearAll ? "CONFIRM CLEAR ALL" : "CLEAR ALL STORAGE"}
          </span>
          {confirmClearAll && (
            <span className="text-xs ml-auto">Click again to confirm</span>
          )}
        </button>
      </div>
    </div>
  );
}

function KeyGroup({
  label,
  keys,
  sizes,
  onDelete,
}: {
  label: string;
  keys: string[];
  sizes: Record<string, number>;
  onDelete: (key: string) => void;
}) {
  return (
    <div>
      <div className="text-xs text-sig-dim tracking-widest mb-2">{label}</div>
      <div className="divide-y divide-gray-700">
        {keys.map((key) => (
          <div key={key} className="flex items-center gap-2 px-2.5 py-2 group">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-sig-text truncate">
                {getKeyLabel(key)}
              </div>
              <div className="text-xs text-sig-dim font-mono truncate">
                {key}
              </div>
            </div>
            <span className="text-xs text-sig-dim tabular-nums shrink-0">
              {formatBytes(sizes[key] ?? 0)}
            </span>
            <button
              onClick={() => onDelete(key)}
              className="p-1.5 rounded text-sig-dim hover:text-sig-danger transition-all shrink-0"
              title={`Clear ${getKeyLabel(key)}`}
              style={{ minWidth: 32, minHeight: 32 }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── About tab ────────────────────────────────────────────────────────

function AboutTab() {
  const sources = [
    {
      name: "OpenSky Network",
      url: "https://opensky-network.org",
      desc: "Aircraft positions",
    },
    {
      name: "USGS Earthquake Hazards",
      url: "https://earthquake.usgs.gov",
      desc: "Seismic data",
    },
    {
      name: "GDELT 2.0",
      url: "https://www.gdeltproject.org",
      desc: "Event intelligence",
    },
    {
      name: "aisstream.io",
      url: "https://aisstream.io",
      desc: "AIS vessel tracking",
    },
    {
      name: "NASA FIRMS",
      url: "https://firms.modaps.eosdis.nasa.gov",
      desc: "Fire hotspots",
    },
    {
      name: "NOAA Weather",
      url: "https://api.weather.gov",
      desc: "Severe weather alerts",
    },
    {
      name: "iptv-org",
      url: "https://github.com/iptv-org",
      desc: "Video feed channels",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-sig-dim tracking-widest mb-2">
          APPLICATION
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
            <span className="text-sig-dim">Name</span>
            <span className="text-sig-text font-semibold tracking-wider">
              SIGINT
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
            <span className="text-sig-dim">Stack</span>
            <span className="text-sig-text">
              Bun · React 19 · Tailwind 4 · Canvas 2D
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
            <span className="text-sig-dim">Rendering</span>
            <span className="text-sig-text">Web Worker + OffscreenCanvas</span>
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs text-sig-dim tracking-widest mb-2">
          DATA SOURCES
        </div>
        <div className="divide-y divide-gray-700">
          {sources.map((s) => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2.5 py-2 text-sm text-sig-text hover:bg-sig-accent/5 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <span className="text-sig-bright">{s.name}</span>
                <span className="text-sig-dim ml-2">{s.desc}</span>
              </div>
              <ExternalLink
                size={12}
                className="text-sig-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              />
            </a>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-sig-dim tracking-widest mb-2">AUTHOR</div>
        <a
          href="https://github.com/iiTONELOC"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-sig-accent hover:text-sig-bright transition-colors"
        >
          Anthony Tropeano
          <ExternalLink size={12} />
        </a>
      </div>

      <div className="pt-2 border-t border-sig-border/30">
        <div className="text-xs text-sig-dim/60 leading-snug">
          Guided tours available in the WALKTHROUGH tab.
        </div>
      </div>
    </div>
  );
}

// ── Walkthrough tab ─────────────────────────────────────────────────

function WalkthroughTab({ onClose }: { onClose: () => void }) {
  const [completionStatus, setCompletionStatus] = useState<boolean | null>(null);

  useEffect(() => {
    cacheGet<boolean>(CACHE_KEYS.walkthroughComplete).then((done) => {
      setCompletionStatus(done ?? false);
    });
  }, []);

  const launch = useCallback(
    (mode: "essential" | "advanced" | "both") => {
      onClose();
      setTimeout(() => requestWalkthroughLaunch(mode), 300);
    },
    [onClose],
  );

  const handleResetCompletion = useCallback(async () => {
    await cacheDelete(CACHE_KEYS.walkthroughComplete);
    setCompletionStatus(false);
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-sig-dim tracking-widest mb-2">
          GUIDED TOURS
        </div>
        <div className="text-xs text-sig-dim/70 mb-3 leading-snug">
          Interactive walkthroughs that guide you through SIGINT's features.
          Each tour can be replayed anytime.
        </div>
        <div className="space-y-2">
          <button
            onClick={() => launch("both")}
            className="flex items-center gap-2 px-3 py-2.5 rounded text-sm text-sig-text border border-sig-border/50 hover:text-sig-accent hover:border-sig-accent/30 transition-colors w-full"
          >
            <BookOpen size={14} className="text-sig-accent shrink-0" />
            <div className="flex-1 text-left">
              <span className="font-semibold tracking-wider">FULL TOUR</span>
              <span className="text-xs text-sig-dim ml-2">Essentials + Advanced</span>
            </div>
          </button>
          <button
            onClick={() => launch("essential")}
            className="flex items-center gap-2 px-3 py-2.5 rounded text-sm text-sig-text border border-sig-border/50 hover:text-sig-accent hover:border-sig-accent/30 transition-colors w-full"
          >
            <BookOpen size={14} className="text-sig-dim shrink-0" />
            <div className="flex-1 text-left">
              <span className="font-semibold tracking-wider">ESSENTIALS ONLY</span>
              <span className="text-xs text-sig-dim ml-2">Globe, panes, presets</span>
            </div>
          </button>
          <button
            onClick={() => launch("advanced")}
            className="flex items-center gap-2 px-3 py-2.5 rounded text-sm text-sig-text border border-sig-border/50 hover:text-sig-accent hover:border-sig-accent/30 transition-colors w-full"
          >
            <BookOpen size={14} className="text-sig-dim shrink-0" />
            <div className="flex-1 text-left">
              <span className="font-semibold tracking-wider">ADVANCED ONLY</span>
              <span className="text-xs text-sig-dim ml-2">Watch mode, filters, settings</span>
            </div>
          </button>
        </div>
      </div>

      <div className="pt-2 border-t border-sig-border/30">
        <div className="text-xs text-sig-dim tracking-widest mb-2">
          COMPLETION STATUS
        </div>
        <div className="flex items-center gap-2 px-2.5 py-2 rounded bg-sig-bg/30 border border-sig-border/20">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${completionStatus ? "bg-sig-accent" : "bg-sig-dim/40"}`}
          />
          <span className="text-sm text-sig-text flex-1">
            {completionStatus ? "Tour completed" : "Tour not completed"}
          </span>
          {completionStatus && (
            <button
              onClick={handleResetCompletion}
              className="flex items-center gap-1 text-xs text-sig-dim hover:text-sig-accent transition-colors"
            >
              <RotateCcw size={10} />
              RESET
            </button>
          )}
        </div>
        <div className="text-xs text-sig-dim/60 mt-1.5 leading-snug">
          Resetting allows the tour to auto-start on next visit. You can also
          replay tours manually using the buttons above.
        </div>
      </div>
    </div>
  );
}

// ── News Feeds tab ──────────────────────────────────────────────────

const NEWS_SOURCES = [
  "Reuters via Google",
  "NYT World",
  "BBC World",
  "Al Jazeera",
  "The Guardian",
  "NPR World",
] as const;

function NewsFeedsTab() {
  const handleClearCache = useCallback(() => {
    cacheDelete(CACHE_KEYS.news);
    window.location.reload();
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-sig-dim tracking-widest mb-2">
          DEFAULT SOURCES
        </div>
        <div className="text-xs text-sig-dim/70 mb-2 leading-snug">
          These feeds are polled server-side every 10 minutes and cached
          locally.
        </div>
        <div className="divide-y divide-gray-700">
          {NEWS_SOURCES.map((name) => (
            <div key={name} className="flex items-center gap-2 px-2 py-2">
              <Rss size={11} className="text-sig-dim shrink-0" />
              <span className="text-sm font-mono tracking-wider flex-1 text-sig-text">
                {name}
              </span>
              <span className="text-xs text-sig-dim tracking-wider">RSS</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-sig-dim tracking-widest mb-2">CACHE</div>
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={handleClearCache}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold tracking-wider text-sig-dim border border-sig-border/50 hover:text-sig-danger hover:border-sig-danger/30 transition-colors"
          >
            <Trash2 size={12} />
            CLEAR NEWS CACHE
          </button>
          <span className="text-xs text-sig-dim/60">
            Articles cached locally for 12 hours
          </span>
        </div>
      </div>
    </div>
  );
}
