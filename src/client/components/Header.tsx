import { useState, useEffect, useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";

import { featureList } from "@/features/registry";
import type { AircraftFilter } from "@/features/tracking/aircraft/types";
import { AircraftFilterControl } from "@/features/tracking/aircraft";
import { Tooltip } from "@/components/Tooltip";
import { AlertTriangle, Settings } from "lucide-react";
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
  label: string;
  icon: React.ForwardRefExoticComponent<any>;
  on: boolean;
  color: string;
  count: number;
  down: boolean;
  iconProps: Record<string, unknown>;
  onToggle: () => void;
}) {
  const tooltipText =
    down && count === 0
      ? `${label} — source offline`
      : `${on ? "Hide" : "Show"} ${label}`;

  return (
    <Tooltip content={tooltipText} placement="bottom">
      <button
        onClick={onToggle}
        className="flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 md:px-2 py-0.5 rounded tracking-wide transition-all font-semibold text-(length:--sig-text-btn) border shrink-0 touch-target justify-center sm:justify-start"
        style={{
          color: on ? color : undefined,
          background: on ? `${color}15` : undefined,
          borderColor: on ? `${color}50` : undefined,
        }}
      >
        <Icon size="var(--sig-text-icon)" {...iconProps} />
        <span className="hidden sm:inline">
          {down && count === 0 ? (
            <AlertTriangle
              size={10}
              strokeWidth={2.5}
              className="text-sig-dim opacity-60"
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
  const { theme, mode } = useTheme();
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
          .filter((f) => f.id !== "aircraft")
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
              bright: mode === "dark" ? "#00b8d4" : C.accent,
              dim: C.dim,
              danger: C.danger,
            }}
        />
        </div>
      </div>
    </>
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
      <div className="hidden lg:flex items-center gap-1.5 px-3 md:px-4 py-1.5">
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

        {/* Clock + Settings */}
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
          <Tooltip content="Settings" placement="bottom">
            <button
              data-tour="settings-button"
              onClick={() => setShowSettings(true)}
              className="p-1.5 rounded text-sig-dim hover:text-sig-accent transition-colors touch-target flex items-center justify-center"
            >
              <Settings size={15} strokeWidth={2} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ── SMALL SCREENS: Two rows ───────────────────────────────── */}
      <div className="lg:hidden">
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
            <button
              data-tour="settings-button"
              onClick={() => setShowSettings(true)}
              className="p-1.5 rounded text-sig-dim hover:text-sig-accent transition-colors touch-target flex items-center justify-center"
              title="Settings"
            >
              <Settings size={14} strokeWidth={2} />
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
