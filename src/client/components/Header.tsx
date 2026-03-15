import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";
import { featureList } from "@/features/registry";
import type { AircraftFilter } from "@/features/aircraft/types";
import { AircraftFilterControl } from "@/features/aircraft";
import { SettingsDropdown } from "./SettingsDropdown";
import {
  mono,
  FONT_SM,
  FONT_BTN,
  FONT_ICON,
  FONT_TITLE,
  FONT_SUBTITLE,
  FONT_CLOCK,
} from "./styles";

interface HeaderProps {
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
}

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
    <div
      className="flex justify-between items-center px-3 md:px-4 py-2 shrink-0 relative"
      style={{
        borderBottom: `1px solid ${C.border}`,
        background: `${C.panel}ee`,
        minHeight: 44,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 md:gap-2.5 shrink-0">
        <div
          className="w-[7px] h-[7px] rounded-full"
          style={{
            background: C.accent,
            boxShadow: `0 0 8px ${C.accent}`,
            animation: "pulse 2s infinite",
          }}
        />
        <span
          className="font-bold tracking-[2.5px]"
          style={mono(C.bright, FONT_TITLE)}
        >
          SIGINT
        </span>
        <span
          className="font-light hidden md:inline"
          style={mono(C.dim, FONT_SUBTITLE)}
        >
          OSINT LIVE FEED
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Search */}
        {searchSlot}

        {/* Layer toggles */}
        <div className="flex gap-1 items-center">
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
                  className="flex items-center gap-1 md:gap-1.5 px-1.5 md:px-2 py-0.5 rounded tracking-wide transition-all font-semibold"
                  style={{
                    ...mono(on ? color : C.dim, FONT_BTN),
                    background: on ? `${color}15` : "transparent",
                    border: `1px solid ${on ? `${color}50` : C.border}`,
                    cursor: "pointer",
                  }}
                >
                  <Icon
                    size={FONT_ICON}
                    {...(f.id === "events"
                      ? { fill: "currentColor", strokeWidth: 0 }
                      : { strokeWidth: 2.5 })}
                  />
                  <span>{counts[f.id] ?? 0}</span>
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
            className="px-2 py-0.5 rounded tracking-wider font-semibold"
            style={{
              ...mono(C.accent, FONT_BTN),
              background: "transparent",
              border: `1px solid ${C.border}`,
              cursor: "pointer",
            }}
          >
            {flat ? "\u25C9 GLOBE" : "\u25AD FLAT"}
          </button>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className="px-2 py-0.5 rounded tracking-wider font-semibold"
            style={{
              ...mono(autoRotate ? C.accent : C.dim, FONT_BTN),
              background: autoRotate ? `${C.accent}18` : "transparent",
              border: `1px solid ${autoRotate ? `${C.accent}70` : C.border}`,
              cursor: "pointer",
            }}
          >
            {autoRotate ? "⏸ ROT" : "▶ ROT"}
          </button>

          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded"
            style={{ border: `1px solid ${C.border}` }}
          >
            <span style={mono(C.dim, FONT_SM)}>SPD</span>
            <input
              type="range"
              aria-label="Rotation speed"
              title="Rotation speed"
              min={0.1}
              max={2}
              step={0.1}
              value={rotationSpeed}
              onChange={(e) => setRotationSpeed(Number(e.target.value))}
              style={{ width: 60, cursor: "pointer", accentColor: C.accent }}
            />
          </div>
        </div>

        {/* Mobile: gear dropdown for view controls */}
        <div className="lg:hidden">
          <SettingsDropdown
            flat={flat}
            setFlat={setFlat}
            autoRotate={autoRotate}
            setAutoRotate={setAutoRotate}
            rotationSpeed={rotationSpeed}
            setRotationSpeed={setRotationSpeed}
          />
        </div>

        {/* Clock */}
        <div className="text-right shrink-0">
          <div
            className="font-semibold tracking-wider"
            style={mono(C.accent, FONT_CLOCK)}
          >
            {time.toLocaleTimeString("en-US", { hour12: false })}
          </div>
          <div
            className="tracking-wide hidden sm:block"
            style={mono(C.dim, FONT_SM)}
          >
            {time.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
