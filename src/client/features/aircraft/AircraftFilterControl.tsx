import React, { useEffect, useRef, useState } from "react";
import { Plane } from "lucide-react";
import { type AircraftFilter } from "./types";

interface FilterThemeColors {
  panel: string;
  border: string;
  bright: string;
  dim: string;
  danger: string;
}

interface AircraftFilterControlProps {
  readonly aircraftFilter: AircraftFilter;
  readonly setAircraftFilter: React.Dispatch<
    React.SetStateAction<AircraftFilter>
  >;
  readonly aircraftCount: number;
  readonly aircraftColor: string;
  readonly availableCountries: string[];
  readonly colors: FilterThemeColors;
}

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
        className="flex items-center gap-1.5 px-2 py-0.5 rounded tracking-wide transition-all font-semibold"
        style={{
          background: aircraftFilter.enabled
            ? aircraftColor + "15"
            : "transparent",
          border: `1px solid ${aircraftFilter.enabled ? aircraftColor + "50" : colors.border}`,
          color: aircraftFilter.enabled ? aircraftColor : colors.dim,
          fontFamily: "inherit",
          fontSize: "clamp(10px, 1.5vw, 14px)",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: "clamp(12px, 1.8vw, 16px)" }}>
          <Plane size="1em" fill="currentColor" strokeWidth={0} />
        </span>
        <span>{aircraftCount}</span>
        <span style={{ fontSize: "clamp(8px, 1.1vw, 10px)", opacity: 0.6 }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded z-[60]"
          style={{
            background: colors.panel,
            border: `1px solid ${colors.border}`,
            padding: "10px 12px",
            minWidth: 220,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <div
            className="flex justify-between items-center mb-2"
            style={{
              borderBottom: `1px solid ${colors.border}`,
              paddingBottom: 6,
            }}
          >
            <span
              style={{
                color: colors.bright,
                fontSize: 11,
                letterSpacing: 1,
                opacity: 0.82,
              }}
            >
              AIRCRAFT
            </span>
            <button
              onClick={() =>
                setAircraftFilter((f) => ({
                  ...f,
                  enabled: !f.enabled,
                }))
              }
              style={{
                color: aircraftFilter.enabled ? aircraftColor : colors.bright,
                fontSize: 12,
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {aircraftFilter.enabled ? "ON" : "OFF"}
            </button>
          </div>

          <div className="mb-2">
            <div
              style={{
                color: colors.bright,
                fontSize: 11,
                opacity: 0.78,
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
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
                      setAircraftFilter((f) => ({
                        ...f,
                        [key]: !f[key],
                      }))
                    }
                    style={{
                      background: on
                        ? aircraftColor + "24"
                        : colors.panel + "55",
                      border: `1px solid ${on ? aircraftColor + "d0" : colors.bright + "66"}`,
                      color: on ? aircraftColor : colors.bright,
                      borderRadius: 3,
                      padding: "2px 7px",
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div
              style={{
                color: colors.bright,
                fontSize: 11,
                opacity: 0.78,
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              SQUAWK <span style={{ opacity: 0.5 }}>(empty = all)</span>
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
                    style={{
                      background: on ? clr + "28" : colors.panel + "55",
                      border: `1px solid ${on ? clr : colors.bright + "66"}`,
                      color: on ? clr : colors.bright,
                      borderRadius: 3,
                      padding: "2px 7px",
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {availableCountries.length > 0 && (
            <div
              className="mt-2"
              style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 6 }}
            >
              <div
                style={{
                  color: colors.bright,
                  fontSize: 11,
                  letterSpacing: 1,
                  marginBottom: 4,
                  opacity: 0.78,
                }}
              >
                COUNTRY <span style={{ opacity: 0.5 }}>(empty = all)</span>
              </div>
              <div
                className="flex gap-1 flex-wrap aircraft-country-scroll"
                style={{ maxHeight: 88, overflowY: "auto", paddingRight: 4 }}
              >
                {availableCountries.map((country) => {
                  const on = aircraftFilter.countries.has(country);
                  return (
                    <button
                      key={country}
                      onClick={() => toggleCountry(country)}
                      style={{
                        background: on
                          ? aircraftColor + "24"
                          : colors.panel + "55",
                        border: `1px solid ${on ? aircraftColor + "d0" : colors.bright + "66"}`,
                        color: on ? aircraftColor : colors.bright,
                        borderRadius: 3,
                        padding: "2px 6px",
                        fontSize: 11,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
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
