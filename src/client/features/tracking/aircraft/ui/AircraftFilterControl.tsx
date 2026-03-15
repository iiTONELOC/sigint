import React, { useEffect, useRef, useState } from "react";
import { Plane } from "lucide-react";
import { type AircraftFilter } from "../types";

type FilterThemeColors = {
  panel: string;
  border: string;
  bright: string;
  dim: string;
  danger: string;
};

type AircraftFilterControlProps = {
  readonly aircraftFilter: AircraftFilter;
  readonly setAircraftFilter: React.Dispatch<
    React.SetStateAction<AircraftFilter>
  >;
  readonly aircraftCount: number;
  readonly aircraftColor: string;
  readonly availableCountries: string[];
  readonly colors: FilterThemeColors;
};

export function AircraftFilterControl({
  aircraftFilter,
  setAircraftFilter,
  aircraftCount,
  aircraftColor,
  availableCountries,
  colors,
}: Readonly<AircraftFilterControlProps>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggleSquawk = (code: "7700" | "7600" | "7500" | "other") => {
    setAircraftFilter((f) => {
      const next = new Set(f.squawks);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { ...f, squawks: next };
    });
  };

  const toggleCountry = (country: string) => {
    setAircraftFilter((f) => {
      const next = new Set(f.countries);
      if (next.has(country)) next.delete(country);
      else next.add(country);
      return { ...f, countries: next };
    });
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded tracking-wide transition-all font-semibold text-(length:--sig-text-btn)"
        style={{
          background: aircraftFilter.enabled
            ? aircraftColor + "15"
            : "transparent",
          border: `1px solid ${aircraftFilter.enabled ? aircraftColor + "50" : colors.border}`,
          color: aircraftFilter.enabled ? aircraftColor : colors.dim,
        }}
      >
        <span className="text-(length:--sig-text-icon)">
          <Plane size="1em" fill="currentColor" strokeWidth={0} />
        </span>
        <span>{aircraftCount}</span>
        <span className="text-[8px] opacity-60">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 rounded z-60 bg-sig-panel border border-sig-border p-2.5 min-w-55">
          {/* Header */}
          <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-sig-border">
            <span className="text-sig-bright text-[11px] tracking-wider opacity-80">
              AIRCRAFT
            </span>
            <button
              onClick={() =>
                setAircraftFilter((f) => ({ ...f, enabled: !f.enabled }))
              }
              className="text-[12px] bg-transparent border-none"
              style={{
                color: aircraftFilter.enabled ? aircraftColor : colors.bright,
              }}
            >
              {aircraftFilter.enabled ? "ON" : "OFF"}
            </button>
          </div>

          {/* Status */}
          <div className="mb-2">
            <div className="text-sig-bright text-[11px] opacity-80 tracking-wider mb-1">
              STATUS
            </div>
            <div className="flex gap-1 flex-wrap">
              {(
                [
                  ["AIR", "showAirborne"],
                  ["GND", "showGround"],
                ] as const
              ).map(([label, key]) => {
                const on = aircraftFilter[key];
                return (
                  <button
                    key={key}
                    onClick={() =>
                      setAircraftFilter((f) => ({ ...f, [key]: !f[key] }))
                    }
                    className="rounded-sm px-1.5 py-0.5 text-[12px]"
                    style={{
                      background: on
                        ? aircraftColor + "24"
                        : colors.panel + "55",
                      border: `1px solid ${on ? aircraftColor + "d0" : colors.bright + "66"}`,
                      color: on ? aircraftColor : colors.bright,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Squawk */}
          <div>
            <div className="text-sig-bright text-[11px] opacity-80 tracking-wider mb-1">
              SQUAWK <span className="opacity-50">(empty = all)</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {(
                [
                  ["7700", "EMRG", colors.danger],
                  ["7600", "RDOF", "#ff8800"],
                  ["7500", "HJCK", "#cc44ff"],
                  ["other", "NRML", colors.dim],
                ] as const
              ).map(([code, label, clr]) => {
                const on = aircraftFilter.squawks.has(code as any);
                return (
                  <button
                    key={code}
                    onClick={() => toggleSquawk(code as any)}
                    className="rounded-sm px-1.5 py-0.5 text-[12px]"
                    style={{
                      background: on ? clr + "28" : colors.panel + "55",
                      border: `1px solid ${on ? clr : colors.bright + "66"}`,
                      color: on ? clr : colors.bright,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Countries */}
          {availableCountries.length > 0 && (
            <div className="mt-2 pt-1.5 border-t border-sig-border">
              <div className="text-sig-bright text-[11px] tracking-wider mb-1 opacity-80">
                COUNTRY <span className="opacity-50">(empty = all)</span>
              </div>
              <div className="flex gap-1 flex-wrap sigint-scroll max-h-22 overflow-y-auto pr-1">
                {availableCountries.map((country) => {
                  const on = aircraftFilter.countries.has(country);
                  return (
                    <button
                      key={country}
                      onClick={() => toggleCountry(country)}
                      className="rounded-sm px-1.5 py-0.5 text-[11px] whitespace-nowrap"
                      style={{
                        background: on
                          ? aircraftColor + "24"
                          : colors.panel + "55",
                        border: `1px solid ${on ? aircraftColor + "d0" : colors.bright + "66"}`,
                        color: on ? aircraftColor : colors.bright,
                      }}
                    >
                      {country}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
