import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";
import { featureList } from "@/features/registry";
import type { AircraftFilter } from "@/features/aircraft/types";
import { AircraftFilterControl } from "@/features/aircraft";

type HeaderProps = {
  readonly layers: Record<string, boolean>;
  readonly toggleLayer: (key: string) => void;
  readonly counts: Record<string, number>;
  readonly flat: boolean;
  readonly setFlat: (v: boolean) => void;
  readonly autoRotate: boolean;
  readonly setAutoRotate: (v: boolean) => void;
  readonly rotationSpeed: number;
  readonly setRotationSpeed: (v: number) => void;
  readonly aircraftFilter: AircraftFilter;
  readonly setAircraftFilter: React.Dispatch<
    React.SetStateAction<AircraftFilter>
  >;
  readonly availableCountries: string[];
  readonly searchSlot?: React.ReactNode;
};

export function Header({
  layers,
  toggleLayer,
  counts,
  flat,
  setFlat,
  autoRotate,
  setAutoRotate,
  rotationSpeed,
  setRotationSpeed,
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

  return (
    <div className="shrink-0 border-b border-sig-border bg-sig-panel/95">
      {/* ── ROW 1: Logo, layer toggles, clock ──────────────────────── */}
      <div className="flex justify-between items-center px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 relative min-h-10">
        {/* Logo */}
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5 shrink-0">
          <div className="w-1.5 h-1.5 sm:w-1.75 sm:h-1.75 rounded-full bg-sig-accent shadow-[0_0_8px_var(--sigint-accent)] animate-[pulse_2s_infinite]" />
          <span className="font-bold tracking-[2px] sm:tracking-[2.5px] text-sig-bright text-(length:--sig-text-title)">
            SIGINT
          </span>
          <span className="font-light hidden md:inline text-sig-dim text-(length:--sig-text-subtitle)">
            OSINT LIVE FEED
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
          {/* Desktop search */}
          <div className="hidden lg:block">{searchSlot}</div>

          {/* Layer toggles */}
          <div className="flex gap-0.5 sm:gap-1 items-center">
            {featureList
              .filter((f) => f.id !== "aircraft")
              .map((f) => {
                const Icon = f.icon;
                const on = layers[f.id] ?? false;
                const color = colorMap[f.id] ?? C.dim;
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleLayer(f.id)}
                    className="flex items-center gap-0.5 sm:gap-1 md:gap-1.5 px-1 sm:px-1.5 md:px-2 py-0.5 rounded tracking-wide transition-all font-semibold text-(length:--sig-text-btn)"
                    style={{
                      color: on ? color : C.dim,
                      background: on ? `${color}15` : "transparent",
                      border: `1px solid ${on ? `${color}50` : C.border}`,
                    }}
                  >
                    <Icon
                      size="var(--sig-text-icon)"
                      {...(f.id === "events"
                        ? { fill: "currentColor", strokeWidth: 0 }
                        : { strokeWidth: 2.5 })}
                    />
                    <span className="hidden sm:inline">
                      {counts[f.id] ?? 0}
                    </span>
                  </button>
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

          {/* Desktop: inline view controls */}
          <div className="hidden lg:flex items-center gap-1.5">
            <button
              onClick={() => setFlat(!flat)}
              className="px-2 py-0.5 rounded tracking-wider font-semibold text-sig-accent text-(length:--sig-text-btn) bg-transparent border border-sig-border"
            >
              {flat ? "\u25C9 GLOBE" : "\u25AD FLAT"}
            </button>

            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`px-2 py-0.5 rounded tracking-wider font-semibold text-(length:--sig-text-btn) ${
                autoRotate
                  ? "text-sig-accent bg-sig-accent/10 border border-sig-accent/45"
                  : "text-sig-dim bg-transparent border border-sig-border"
              }`}
            >
              {autoRotate ? "⏸ ROT" : "▶ ROT"}
            </button>

            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-sig-border">
              <span className="text-sig-dim text-(length:--sig-text-sm)">
                SPD
              </span>
              <input
                type="range"
                aria-label="Rotation speed"
                title="Rotation speed"
                min={0.1}
                max={2}
                step={0.1}
                value={rotationSpeed}
                onChange={(e) => setRotationSpeed(Number(e.target.value))}
                className="w-15 cursor-pointer accent-sig-accent"
              />
            </div>
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
      </div>

      {/* ── ROW 2: Mobile controls bar ─────────────────────────────── */}
      <div className="flex lg:hidden items-center gap-1.5 px-2 sm:px-3 pb-1.5 pt-0.5 overflow-x-auto border-t border-sig-border/25">
        {searchSlot}

        <div className="w-px h-4 shrink-0 bg-sig-border" />

        <button
          onClick={() => setFlat(!flat)}
          className="px-1.5 py-0.5 rounded tracking-wider font-semibold shrink-0 text-sig-accent text-(length:--sig-text-btn) bg-transparent border border-sig-border"
        >
          {flat ? "\u25C9 GLOBE" : "\u25AD FLAT"}
        </button>

        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={`px-1.5 py-0.5 rounded tracking-wider font-semibold shrink-0 text-(length:--sig-text-btn) ${
            autoRotate
              ? "text-sig-accent bg-sig-accent/10 border border-sig-accent/45"
              : "text-sig-dim bg-transparent border border-sig-border"
          }`}
        >
          {autoRotate ? "⏸ ROT" : "▶ ROT"}
        </button>

        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded shrink-0 border border-sig-border">
          <span className="text-sig-dim text-(length:--sig-text-sm)">SPD</span>
          <input
            type="range"
            aria-label="Rotation speed"
            title="Rotation speed"
            min={0.1}
            max={2}
            step={0.1}
            value={rotationSpeed}
            onChange={(e) => setRotationSpeed(Number(e.target.value))}
            className="w-[50px] cursor-pointer accent-sig-accent"
          />
        </div>
      </div>
    </div>
  );
}
