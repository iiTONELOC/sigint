import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Plane } from "lucide-react";
import { MilFilter, SquawkBucket } from "@shared/domain/aircraft";
import type { AircraftFilterValues } from "@shared/domain/aircraftFilter";
import { DomEvent, DomKey } from "@/runtime";
import { ButtonType } from "@/lib/ui/button";
import { cn } from "@/lib/ui/utils";

enum AircraftVisibilityField {
  Airborne = "showAirborne",
  Ground = "showGround",
}

enum AircraftFilterClassName {
  AircraftRoleActive = "bg-sig-aircraft/15 border-sig-aircraft text-sig-aircraft",
  AircraftRoleInactive = "bg-sig-panel/30 border-sig-aircraft/40 text-sig-aircraft",
  BrightRoleActive = "bg-sig-bright/15 border-sig-bright text-sig-bright",
  BrightRoleInactive = "bg-sig-panel/30 border-sig-bright/40 text-sig-bright",
  Dimmed = "opacity-50",
  Inactive = "bg-sig-panel/30 border-sig-border text-sig-dim",
  Option = "touch-target rounded-sm border px-1.5 py-0.5 text-[12px] transition-colors",
  OptionRow = "flex flex-wrap gap-1",
  ReconRoleActive = "bg-sig-recon/15 border-sig-recon text-sig-recon",
  ReconRoleInactive = "bg-sig-panel/30 border-sig-recon/40 text-sig-recon",
  Section = "mb-2",
  SectionHeading = "mb-1 text-[11px] tracking-wider text-sig-bright opacity-80",
}

type AircraftRolePresentation = Readonly<{
  activeClassName: AircraftFilterClassName;
  inactiveClassName: AircraftFilterClassName;
  label: string;
}>;

type AircraftSquawkPresentation = Readonly<{
  activeClassName: string;
  label: string;
}>;

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

const SQUAWK_FILTER_PRESENTATION: Readonly<
  Record<SquawkBucket, AircraftSquawkPresentation>
> = {
  [SquawkBucket.Emergency]: {
    activeClassName: "border-(--sigint-aircraftEmergency) text-(--sigint-aircraftEmergency)",
    label: "EMRG",
  },
  [SquawkBucket.RadioFailure]: {
    activeClassName: "border-(--sigint-aircraftRadioFailure) text-(--sigint-aircraftRadioFailure)",
    label: "RDOF",
  },
  [SquawkBucket.Hijack]: {
    activeClassName: "border-(--sigint-aircraftHijack) text-(--sigint-aircraftHijack)",
    label: "HJCK",
  },
  [SquawkBucket.Other]: {
    activeClassName: "border-sig-dim text-sig-dim",
    label: "NRML",
  },
};

type AircraftFilterControlProps = Readonly<{
  aircraftFilter: AircraftFilterValues;
  setAircraftFilter: Dispatch<SetStateAction<AircraftFilterValues>>;
  aircraftCount: number;
  availableCountries: readonly string[];
}>;

function toggledArrayValue<T>(
  values: readonly T[],
  value: T,
): readonly T[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

export function AircraftFilterControl({
  aircraftFilter,
  setAircraftFilter,
  aircraftCount,
  availableCountries,
}: AircraftFilterControlProps) {
  const [open, setOpen] = useState(false);
  const disclosureId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const closeFromOutside = (event: MouseEvent | TouchEvent): void => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeFromKeyboard = (event: KeyboardEvent): void => {
      if (event.key !== DomKey.Escape) return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener(DomEvent.MouseDown, closeFromOutside);
    document.addEventListener(DomEvent.TouchStart, closeFromOutside);
    document.addEventListener(DomEvent.KeyDown, closeFromKeyboard);
    return () => {
      document.removeEventListener(DomEvent.MouseDown, closeFromOutside);
      document.removeEventListener(DomEvent.TouchStart, closeFromOutside);
      document.removeEventListener(DomEvent.KeyDown, closeFromKeyboard);
    };
  }, [open]);

  const toggleSquawk = (value: SquawkBucket): void => {
    setAircraftFilter((filter) => ({
      ...filter,
      squawks: toggledArrayValue(filter.squawks, value),
    }));
  };

  const toggleCountry = (value: string): void => {
    setAircraftFilter((filter) => ({
      ...filter,
      countries: toggledArrayValue(filter.countries, value),
    }));
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type={ButtonType.Button}
        ref={buttonRef}
        onClick={() => setOpen((current) => !current)}
        aria-controls={disclosureId}
        aria-expanded={open}
        aria-label="Aircraft filters"
        className={cn(
          "touch-target flex shrink-0 items-center justify-center gap-1.5 rounded border px-1 py-0.5 text-(length:--sig-text-btn) font-semibold tracking-wide transition-colors sm:justify-start sm:px-1.5 md:px-2",
          aircraftFilter.enabled
            ? AircraftFilterClassName.AircraftRoleActive
            : AircraftFilterClassName.Inactive,
        )}
      >
        <span className="text-(length:--sig-text-icon)">
          <Plane aria-hidden={true} size="1em" fill="currentColor" strokeWidth={0} />
        </span>
        <span className="hidden sm:inline">{aircraftCount}</span>
        <span aria-hidden={true} className="text-[8px] opacity-60">▾</span>
      </button>

      {open && (
        <div
          id={disclosureId}
          ref={panelRef}
          tabIndex={-1}
          aria-label="Aircraft filter options"
          className="absolute top-full right-0 z-(--layer-menu) mt-1 min-w-55 max-w-72 rounded border border-sig-border bg-sig-panel p-2.5 shadow-2xl outline-none"
        >
          <div className="mb-2 flex items-center justify-between border-b border-sig-border pb-1.5">
            <span className="text-[11px] tracking-wider text-sig-bright opacity-80">
              AIRCRAFT
            </span>
            <button
              type={ButtonType.Button}
              aria-pressed={aircraftFilter.enabled}
              onClick={() =>
                setAircraftFilter((filter) => ({
                  ...filter,
                  enabled: !filter.enabled,
                }))
              }
              className="touch-target border-none bg-transparent text-[12px] text-sig-aircraft"
            >
              {aircraftFilter.enabled ? "ON" : "OFF"}
            </button>
          </div>

          <div className={AircraftFilterClassName.Section}>
            <div className={AircraftFilterClassName.SectionHeading}>STATUS</div>
            <div className={AircraftFilterClassName.OptionRow}>
              {Object.values(AircraftVisibilityField).map((field) => {
                const active = aircraftFilter[field];
                return (
                  <button
                    type={ButtonType.Button}
                    key={field}
                    aria-pressed={active}
                    onClick={() =>
                      setAircraftFilter((filter) => ({
                        ...filter,
                        [field]: !filter[field],
                      }))
                    }
                    className={cn(
                      AircraftFilterClassName.Option,
                      active
                        ? AircraftFilterClassName.AircraftRoleActive
                        : AircraftFilterClassName.Inactive,
                    )}
                  >
                    {AIRCRAFT_VISIBILITY_LABELS[field]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={AircraftFilterClassName.Section}>
            <div className={AircraftFilterClassName.SectionHeading}>TYPE</div>
            <div className={AircraftFilterClassName.OptionRow}>
              {Object.values(MilFilter).map((value) => {
                const presentation = AIRCRAFT_ROLE_PRESENTATION[value];
                const active = aircraftFilter.milFilter === value;
                return (
                  <button
                    key={value}
                    type={ButtonType.Button}
                    aria-pressed={active}
                    onClick={() =>
                      setAircraftFilter((filter) => ({
                        ...filter,
                        milFilter: value,
                      }))
                    }
                    className={cn(
                      AircraftFilterClassName.Option,
                      active
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

          <div>
            <div className={AircraftFilterClassName.SectionHeading}>
              SQUAWK {" "}
              <span className={AircraftFilterClassName.Dimmed}>
                (empty = all)
              </span>
            </div>
            <div className={AircraftFilterClassName.OptionRow}>
              {Object.values(SquawkBucket).map((value) => {
                const presentation = SQUAWK_FILTER_PRESENTATION[value];
                const active = aircraftFilter.squawks.includes(value);
                return (
                  <button
                    type={ButtonType.Button}
                    key={value}
                    aria-pressed={active}
                    onClick={() => toggleSquawk(value)}
                    className={cn(
                      AircraftFilterClassName.Option,
                      active
                        ? presentation.activeClassName
                        : AircraftFilterClassName.Inactive,
                    )}
                  >
                    {presentation.label}
                  </button>
                );
              })}
            </div>
          </div>

          {availableCountries.length > 0 && (
            <div className="mt-2 border-t border-sig-border pt-1.5">
              <div className={AircraftFilterClassName.SectionHeading}>
                COUNTRY {" "}
                <span className={AircraftFilterClassName.Dimmed}>
                  (empty = all)
                </span>
              </div>
              <div className="sigint-scroll flex max-h-22 flex-wrap gap-1 overflow-y-auto pr-1">
                {availableCountries.map((country) => {
                  const active = aircraftFilter.countries.includes(country);
                  return (
                    <button
                      type={ButtonType.Button}
                      key={country}
                      aria-pressed={active}
                      onClick={() => toggleCountry(country)}
                      className={cn(
                        AircraftFilterClassName.Option,
                        "whitespace-nowrap text-[11px]",
                        active
                          ? AircraftFilterClassName.AircraftRoleActive
                          : AircraftFilterClassName.Inactive,
                      )}
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
