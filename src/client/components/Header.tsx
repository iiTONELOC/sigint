import { useState, useEffect, useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";

import { featureList } from "@/features/registry";
import type { AircraftFilter } from "@/features/tracking/aircraft/types";
import { AircraftFilterControl } from "@/features/tracking/aircraft";
import { Tooltip } from "@/components/Tooltip";
import { AlertTriangle } from "lucide-react";
import {
  isSourceDown,
  buildSourceStatusMap,
  type SourceStatus,
} from "@/lib/sourceHealth";

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
        className="flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 md:px-2 py-0.5 rounded tracking-wide transition-all font-semibold text-(length:--sig-text-btn) border shrink-0"
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

// ── Main Header ──────────────────────────────────────────────────────

export function Header({
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
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  const sourceStatusMap = useMemo(
    () => buildSourceStatusMap(dataSources),
    [dataSources],
  );

  return (
    <div className="shrink-0 border-b border-sig-border bg-sig-panel/95">
      {/* ── ROW 1: Logo + Clock ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-2 sm:px-3 md:px-4 py-1 sm:py-1.5">
        {/* Logo */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="w-1.5 h-1.5 sm:w-1.75 sm:h-1.75 rounded-full bg-sig-accent shadow-[0_0_8px_var(--sigint-accent)] animate-[pulse_2s_infinite]" />
          <span className="font-bold tracking-[2px] sm:tracking-[2.5px] text-sig-bright text-(length:--sig-text-title)">
            SIGINT
          </span>
          <span className="font-light hidden md:inline text-sig-dim text-(length:--sig-text-subtitle)">
            OSINT LIVE FEED
          </span>
        </div>

        {/* Clock */}
        <div className="text-right shrink-0">
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
      </div>

      {/* ── ROW 2: Search + Layer toggles ───────────────────────────── */}
      <div className="flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 md:px-4 pb-1 sm:pb-1.5 overflow-x-auto sigint-scroll">
        {/* Search */}
        {searchSlot}

        {/* Separator */}
        <div className="w-px h-4 shrink-0 bg-sig-border/40 mx-0.5" />

        {/* Layer toggles */}
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
  );
}
