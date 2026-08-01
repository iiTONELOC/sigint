import React, { useEffect, useRef, useState } from "react";
import { MilFilter, SquawkBucket } from "@shared/domain/aircraft";
import { createPortal } from "react-dom";
import { Plane } from "lucide-react";
import { type AircraftFilter } from "../types";
import { DomEvent } from "@/runtime";
import { ButtonType } from "@/lib/ui/button";
import { cn } from "@/lib/ui/utils";

enum AircraftVisibilityField {
  Airborne = "showAirborne",
  Ground = "showGround",
}

enum AircraftFilterColor {
  Hijack = "#cc44ff",
  RadioFailure = "#ff8800",
}

enum AircraftFilterClassName {
  AircraftRoleActive = "bg-sig-aircraft/15 border-sig-aircraft text-sig-aircraft",
  AircraftRoleInactive = "bg-sig-panel/30 border-sig-aircraft/40 text-sig-aircraft",
  BrightRoleActive = "bg-sig-bright/15 border-sig-bright text-sig-bright",
  BrightRoleInactive = "bg-sig-panel/30 border-sig-bright/40 text-sig-bright",
  Dimmed = "opacity-50",
  Option = "rounded-sm px-1.5 py-0.5 text-[12px]",
  OptionRow = "flex gap-1 flex-wrap",
  ReconRoleActive = "bg-sig-recon/15 border-sig-recon text-sig-recon",
  ReconRoleInactive = "bg-sig-panel/30 border-sig-recon/40 text-sig-recon",
  Section = "mb-2",
  SectionHeading = "text-sig-bright text-[11px] opacity-80 tracking-wider mb-1",
}

type AircraftRolePresentation = {
  readonly activeClassName: AircraftFilterClassName;
  readonly inactiveClassName: AircraftFilterClassName;
  readonly label: string;
};

const AIRCRAFT_VISIBILITY_LABELS: Readonly<
  Record<AircraftVisibilityField, string>
> = {
  [AircraftVisibilityField.Airborne]: "AIR",
  [AircraftVisibilityField.Ground]: "GND",
};

const AIRCRAFT_ROLE_PRESENTATION: Readonly<
  Record<MilFilter, AircraftRolePresentation>
> = {
  [MilFilter.All]: {
    activeClassName: AircraftFilterClassName.AircraftRoleActive,
    inactiveClassName: AircraftFilterClassName.AircraftRoleInactive,
    label: "ALL",
  },
  [MilFilter.Military]: {
    activeClassName: AircraftFilterClassName.BrightRoleActive,
    inactiveClassName: AircraftFilterClassName.BrightRoleInactive,
    label: "MIL",
  },
  [MilFilter.Civilian]: {
    activeClassName: AircraftFilterClassName.AircraftRoleActive,
    inactiveClassName: AircraftFilterClassName.AircraftRoleInactive,
    label: "CIV",
  },
  [MilFilter.Recon]: {
    activeClassName: AircraftFilterClassName.ReconRoleActive,
    inactiveClassName: AircraftFilterClassName.ReconRoleInactive,
    label: "HUNTER",
  },
};

const SQUAWK_FILTER_LABELS: Readonly<Record<SquawkBucket, string>> = {
  [SquawkBucket.Emergency]: "EMRG",
  [SquawkBucket.RadioFailure]: "RDOF",
  [SquawkBucket.Hijack]: "HJCK",
  [SquawkBucket.Other]: "NRML",
};

function squawkFilterColor(
  bucket: SquawkBucket,
  colors: FilterThemeColors,
): string {
  switch (bucket) {
    case SquawkBucket.Emergency:
      return colors.danger;
    case SquawkBucket.RadioFailure:
      return AircraftFilterColor.RadioFailure;
    case SquawkBucket.Hijack:
      return AircraftFilterColor.Hijack;
    case SquawkBucket.Other:
      return colors.dim;
  }
}

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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(
    null,
  );

  // Position dropdown below button using portal
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener(DomEvent.MouseDown, handler);
      document.addEventListener(DomEvent.TouchStart, handler);
    }
    return () => {
      document.removeEventListener(DomEvent.MouseDown, handler);
      document.removeEventListener(DomEvent.TouchStart, handler);
    };
  }, [open]);

  const toggleSquawk = (code: SquawkBucket) => {
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
        type={ButtonType.Button}
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-1 sm:px-1.5 md:px-2 py-0.5 rounded tracking-wide transition-all font-semibold text-(length:--sig-text-btn) shrink-0 touch-target justify-center sm:justify-start"
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
        <span className="hidden sm:inline">{aircraftCount}</span>
        <span className="text-[8px] opacity-60">▾</span>
      </button>

      {open &&
        dropPos &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-80 rounded bg-sig-panel border border-sig-border p-2.5 min-w-55 max-w-72 shadow-2xl"
            style={{ top: dropPos.top, right: dropPos.right }}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-sig-border">
              <span className="text-sig-bright text-[11px] tracking-wider opacity-80">
                AIRCRAFT
              </span>
              <button
                type={ButtonType.Button}
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
            <div className={AircraftFilterClassName.Section}>
              <div className={AircraftFilterClassName.SectionHeading}>
                STATUS
              </div>
              <div className={AircraftFilterClassName.OptionRow}>
                {Object.values(AircraftVisibilityField).map((key) => {
                  const on = aircraftFilter[key];
                  return (
                    <button
                      type={ButtonType.Button}
                      key={key}
                      onClick={() =>
                        setAircraftFilter((f) => ({ ...f, [key]: !f[key] }))
                      }
                      className={AircraftFilterClassName.Option}
                      style={{
                        background: on
                          ? aircraftColor + "24"
                          : colors.panel + "55",
                        border: `1px solid ${on ? aircraftColor + "d0" : colors.bright + "66"}`,
                        color: on ? aircraftColor : colors.bright,
                      }}
                    >
                      {AIRCRAFT_VISIBILITY_LABELS[key]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Military filter */}
            <div className={AircraftFilterClassName.Section}>
              <div className={AircraftFilterClassName.SectionHeading}>
                TYPE
              </div>
              <div className={AircraftFilterClassName.OptionRow}>
                {Object.values(MilFilter).map((value) => {
                  const presentation = AIRCRAFT_ROLE_PRESENTATION[value];
                  const on = aircraftFilter.milFilter === value;
                  return (
                    <button
                      key={value}
                      type={ButtonType.Button}
                      onClick={() =>
                        setAircraftFilter((f) => ({ ...f, milFilter: value }))
                      }
                      className={cn(
                        AircraftFilterClassName.Option,
                        "border transition-colors",
                        on
                          ? presentation.activeClassName
                          : presentation.inactiveClassName,
                      )}
                    >
                      {presentation.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Squawk */}
            <div>
              <div className={AircraftFilterClassName.SectionHeading}>
                SQUAWK {" "}
                <span className={AircraftFilterClassName.Dimmed}>
                  (empty = all)
                </span>
              </div>
              <div className={AircraftFilterClassName.OptionRow}>
                {Object.values(SquawkBucket).map((code) => {
                  const color = squawkFilterColor(code, colors);
                  const on = aircraftFilter.squawks.has(code);
                  return (
                    <button
                      type={ButtonType.Button}
                      key={code}
                      onClick={() => toggleSquawk(code)}
                      className={AircraftFilterClassName.Option}
                      style={{
                        background: on ? color + "28" : colors.panel + "55",
                        border: `1px solid ${on ? color : colors.bright + "66"}`,
                        color: on ? color : colors.bright,
                      }}
                    >
                      {SQUAWK_FILTER_LABELS[code]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Countries */}
            {availableCountries.length > 0 && (
              <div className="mt-2 pt-1.5 border-t border-sig-border">
                <div className={AircraftFilterClassName.SectionHeading}>
                  COUNTRY {" "}
                  <span className={AircraftFilterClassName.Dimmed}>
                    (empty = all)
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap sigint-scroll max-h-22 overflow-y-auto pr-1">
                  {availableCountries.map((country) => {
                    const on = aircraftFilter.countries.has(country);
                    return (
                      <button
                        type={ButtonType.Button}
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
          </div>,
          document.body,
        )}
    </div>
  );
}
