import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useLayoutMode, type LayoutMode } from "@/context/LayoutModeContext";
import { getColorMap } from "@/config/theme";

import { featureList } from "@/features/registry";
import type { AircraftFilter } from "@/features/tracking/aircraft/types";
import { AircraftFilterControl } from "@/features/tracking/aircraft";
import { Tooltip } from "@/components/Tooltip";
import { AlertTriangle, Settings, Smartphone, Monitor } from "lucide-react";
import { shouldShowCyclonesToggle } from "../../shared/cyclonesSeason";
import {
  isSourceDown,
  buildSourceStatusMap,
  type SourceStatus,
} from "@/lib/sourceHealth";
import { SettingsModal } from "@/components/SettingsModal";

type HeaderProps = {
  readonly layers: Record<string, boolean>;
  readonly toggleLayer: (key: string) => void;
  readonly counts: Record<string, number>;
  readonly dataSources: SourceStatus[];
  readonly aircraftFilter: AircraftFilter;
  readonly setAircraftFilter: React.Dispatch<
    React.SetStateAction<AircraftFilter>
  >;
  readonly availableCountries: string[];
  readonly searchSlot?: React.ReactNode;
};

// ── Sub-components ───────────────────────────────────────────────────

function LayerToggle({
  label,
  icon: Icon,
  on,
  color,
  count,
  down,
  iconProps,
  onToggle,
}: {
  readonly label: string;
  readonly icon: React.ForwardRefExoticComponent<any>;
  readonly on: boolean;
  readonly color: string;
  readonly count: number;
  readonly down: boolean;
  readonly iconProps: Record<string, unknown>;
  readonly onToggle: () => void;
}) {
  // Streaming-in indicator: pulse while the count is actively rising
  // (initial sweep ramp / large reconnect), then auto-clear ~5 s after
  // the count stops growing. Avoids the "always pulsing" failure mode
  // for dynamic feeds (AIS, aircraft) where the count drifts a few
  // vessels per poll once the cache is warm.
  const prevCountRef = useRef(count);
  const [streaming, setStreaming] = useState(false);
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = count;
    // Only pulse when count grew meaningfully — small drift on a warm
    // feed shouldn't trigger it. Threshold is relative to the prior
    // count so the first poll after boot (0 → ~thousands) always
    // pulses but a +3 vessel update on 5 k vessels does not.
    const grewMeaningfully = count > prev && count - prev > Math.max(20, prev * 0.05);
    if (!grewMeaningfully) return;
    setStreaming(true);
    const t = setTimeout(() => setStreaming(false), 5_000);
    return () => clearTimeout(t);
  }, [count]);

  const tooltipText =
    streaming && on
      ? `${label} — receiving data`
      : down && count === 0
        ? `${label} — source offline`
        : `${on ? "Hide" : "Show"} ${label}`;

  return (
    <Tooltip content={tooltipText} placement="bottom">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Toggle ${label} layer`}
        aria-pressed={on}
        // Off state needs explicit text + border colors so the icon
        // stays visible after clicking to toggle off; without them
        // the icon inherits the browser default text color and the
        // browser-default focus ring obscures both. focus-visible
        // override replaces the white outline with the theme accent.
        className="flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 md:px-2 py-0.5 rounded tracking-wide transition-all font-semibold text-(length:--sig-text-btn) border shrink-0 touch-target justify-center sm:justify-start focus:outline-none focus-visible:ring-2 focus-visible:ring-sig-accent"
        style={{
          color: on ? color : "var(--sigint-dim)",
          background: on ? `${color}15` : undefined,
          borderColor: on ? `${color}50` : "var(--sigint-border)",
        }}
      >
        <Icon
          size="var(--sig-text-icon)"
          aria-hidden="true"
          {...iconProps}
          className={streaming && on ? "animate-pulse" : undefined}
        />
        <span className="hidden sm:inline">
          {down && count === 0 ? (
            <AlertTriangle
              size={10}
              strokeWidth={2.5}
              className="text-sig-dim opacity-60"
              aria-label={`${label} source offline`}
            />
          ) : (
            count
          )}
        </span>
      </button>
    </Tooltip>
  );
}

// ── Toggles (shared between single-row and two-row layouts) ──────────

function Toggles({
  layers,
  toggleLayer,
  counts,
  dataSources,
  aircraftFilter,
  setAircraftFilter,
  availableCountries,
  searchSlot,
}: Readonly<HeaderProps>) {
  const { theme, resolvedMode } = useTheme();
  const C = theme.colors;
  const colorMap = getColorMap(theme);
  const sourceStatusMap = useMemo(
    () => buildSourceStatusMap(dataSources),
    [dataSources],
  );

  return (
    <>
      <div data-tour="search">{searchSlot}</div>
      <div className="w-px h-4 shrink-0 bg-sig-border/40 mx-0.5" />
      <div data-tour="layer-toggles" className="flex items-center gap-0.5 sm:gap-1">
        {featureList
          // Aircraft has its own filter control. Cyclone-forecast is a
          // synthetic per-track-point variant of the cyclones layer —
          // it's gated by layers.cyclones in the worker, so a separate
          // toggle would be a duplicate of the storm toggle. The
          // cyclones toggle itself is conditionally hidden when all
          // in-scope basins are out of season AND the cyclones source
          // has reported empty (Hard Rule: render-only filter,
          // layers.cyclones survives). Note that `counts.cyclones` is
          // filter-applied — when the user clicks the toggle to OFF,
          // that count drops to 0 and would spuriously hide the toggle
          // mid-session. The source status is what we actually want:
          // "empty" means the upstream confirmed zero storms; any
          // other status (loading / live / cached / mock / error /
          // unavailable) keeps the toggle visible.
          .filter((f) => {
            if (f.id === "aircraft" || f.id === "cyclones-forecast") {
              return false;
            }
            if (f.id === "cyclones") {
              const cyclonesEmpty =
                sourceStatusMap.get("cyclones") === "empty";
              if (!shouldShowCyclonesToggle(cyclonesEmpty ? 0 : 1)) {
                return false;
              }
            }
            return true;
          })
          .map((f) => {
            const on = layers[f.id] ?? false;
            const color = colorMap[f.id] ?? C.dim;
            const status = sourceStatusMap.get(f.id);
            const count = counts[f.id] ?? 0;
            const down = isSourceDown(status, count, f.id);
            return (
              <LayerToggle
                key={f.id}
                label={f.label}
                icon={f.icon}
                on={on}
                color={color}
                count={count}
                down={down}
                iconProps={f.iconProps}
                onToggle={() => toggleLayer(f.id)}
              />
            );
          })}
        <div data-tour="aircraft-filter">
          <AircraftFilterControl
            aircraftFilter={aircraftFilter}
            setAircraftFilter={setAircraftFilter}
            aircraftCount={counts.aircraft ?? 0}
            aircraftColor={colorMap.aircraft ?? C.aircraft}
            availableCountries={availableCountries}
            colors={{
              panel: C.panel,
              border: C.border,
              bright: resolvedMode === "dark" ? "#00b8d4" : C.accent,
              dim: C.dim,
              danger: C.danger,
            }}
        />
        </div>
      </div>
    </>
  );
}

// ── Layout mode toggle button ───────────────────────────────────────

const MODE_LABELS: Record<LayoutMode, string> = {
  auto: "AUTO",
  mobile: "MOBILE",
  desktop: "DESKTOP",
};

const MODE_TOOLTIPS: Record<LayoutMode, string> = {
  auto: "Layout: Auto (viewport-based) — click to force mobile",
  mobile: "Layout: Forced mobile — click to force desktop",
  desktop: "Layout: Forced desktop — click for auto",
};

function LayoutModeToggle() {
  const { mode, cycleMode } = useLayoutMode();
  const Icon = mode === "mobile" ? Smartphone : Monitor;
  const isForced = mode !== "auto";

  return (
    <Tooltip content={MODE_TOOLTIPS[mode]} placement="bottom">
      <button
        data-tour="layout-mode-toggle"
        onClick={cycleMode}
        className={`p-1.5 rounded transition-colors touch-target flex items-center justify-center gap-1 ${
          isForced
            ? "text-sig-accent"
            : "text-sig-dim hover:text-sig-accent"
        }`}
        aria-label={`Layout mode: ${MODE_LABELS[mode]}`}
      >
        <Icon size={14} strokeWidth={2} />
        {isForced && (
          <span className="text-[8px] tracking-widest font-bold hidden sm:inline">
            {MODE_LABELS[mode]}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

// ── Main Header ──────────────────────────────────────────────────────

export function Header(props: Readonly<HeaderProps>) {
  const [time, setTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="shrink-0 border-b border-sig-border bg-sig-panel/95">
      {/* ── LARGE SCREENS: Single row ─────────────────────────────── */}
      {/* Single-row layout requires xl: (1280px+) — at lg (1024px) the
          7 layer toggles + search + clock + settings overflow into the
          aircraft toggle / date-time region. Two-row layout below
          handles everything narrower. */}
      <div className="hidden xl:flex items-center gap-1.5 px-3 md:px-4 py-1.5">
        {/* Logo */}
        <div data-tour="header-brand" className="flex items-center gap-2 shrink-0">
          <div className="w-1.75 h-1.75 rounded-full bg-sig-accent shadow-[0_0_8px_var(--sigint-accent)] animate-[pulse_2s_infinite]" />
          <span className="font-bold tracking-[2.5px] text-sig-bright text-(length:--sig-text-title)">
            SIGINT
          </span>
          <span className="font-light text-sig-dim text-(length:--sig-text-subtitle)">
            OSINT LIVE FEED
          </span>
        </div>

        <div className="w-px h-4 shrink-0 bg-sig-border/40 mx-1" />

        {/* Search + Toggles + Aircraft — centered */}
        <div className="flex items-center justify-center gap-1.5 flex-1 min-w-0">
          <Toggles {...props} />
        </div>

        {/* Clock + Layout Mode + Settings */}
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <div className="text-right">
            <div className="font-semibold tracking-wider text-sig-accent text-(length:--sig-text-clock)">
              {time.toLocaleTimeString("en-US", { hour12: false })}
            </div>
            <div className="tracking-wide text-sig-dim text-(length:--sig-text-sm)">
              {time.toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </div>
          </div>
          <LayoutModeToggle />
          <Tooltip content="Settings" placement="bottom">
            <button
              type="button"
              data-tour="settings-button"
              aria-label="Open settings"
              onClick={() => setShowSettings(true)}
              className="p-1.5 rounded text-sig-dim hover:text-sig-accent transition-colors touch-target flex items-center justify-center"
            >
              <Settings size={15} strokeWidth={2} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ── SMALL SCREENS: Two rows ───────────────────────────────── */}
      <div className="xl:hidden">
        <div className="flex items-center justify-between px-2 sm:px-3 py-1 sm:py-1.5">
          <div data-tour="header-brand" className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="w-1.5 h-1.5 sm:w-1.75 sm:h-1.75 rounded-full bg-sig-accent shadow-[0_0_8px_var(--sigint-accent)] animate-[pulse_2s_infinite]" />
            <span className="font-bold tracking-[2px] sm:tracking-[2.5px] text-sig-bright text-(length:--sig-text-title)">
              SIGINT
            </span>
            <span className="font-light hidden md:inline text-sig-dim text-(length:--sig-text-subtitle)">
              OSINT LIVE FEED
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="text-right">
              <div className="font-semibold tracking-wider text-sig-accent text-(length:--sig-text-clock)">
                {time.toLocaleTimeString("en-US", { hour12: false })}
              </div>
              <div className="tracking-wide hidden sm:block text-sig-dim text-(length:--sig-text-sm)">
                {time.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>
            <LayoutModeToggle />
            <button
              type="button"
              data-tour="settings-button"
              aria-label="Open settings"
              onClick={() => setShowSettings(true)}
              className="p-1.5 rounded text-sig-dim hover:text-sig-accent transition-colors touch-target flex items-center justify-center"
              title="Settings"
            >
              <Settings size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-center gap-0.5 sm:gap-1.5 px-1.5 sm:px-3 pb-1 sm:pb-1.5 flex-wrap">
          <Toggles {...props} />
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
