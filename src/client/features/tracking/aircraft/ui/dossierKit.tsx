import type { ReactNode } from "react";

export enum AircraftChipTone {
  Critical = "text-sig-danger border-sig-danger/40 bg-sig-danger/10",
  Late = "text-sig-fires border-sig-fires/40 bg-sig-fires/10",
  OnTime = "text-sig-quakes border-sig-quakes/40 bg-sig-quakes/10",
  Warning = "text-sig-warn border-sig-warn/40 bg-sig-warn/10",
}

enum AircraftDelayMinutes {
  OnTimeMaximum = 0,
  WarningMaximum = 15,
  LateMaximum = 60,
}

export type AircraftChip = Readonly<{
  label: string;
  tone: AircraftChipTone;
}>;

export function aircraftDelayTone(minutes: number): AircraftChipTone {
  if (minutes <= AircraftDelayMinutes.OnTimeMaximum) {
    return AircraftChipTone.OnTime;
  }
  if (minutes <= AircraftDelayMinutes.WarningMaximum) {
    return AircraftChipTone.Warning;
  }
  if (minutes <= AircraftDelayMinutes.LateMaximum) {
    return AircraftChipTone.Late;
  }
  return AircraftChipTone.Critical;
}

type CardProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

export function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`bg-sig-panel border border-sig-border rounded-[12px] ${className}`}>
      {children}
    </div>
  );
}

type SectionLabelProps = {
  readonly children: ReactNode;
};

export function SectionLabel({ children }: SectionLabelProps) {
  return (
    <h3 className="text-(length:--sig-text-xs) font-semibold tracking-widest text-(--dossier-accent) mb-2">
      {children}
    </h3>
  );
}

export function Label({ children, className = "" }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className={`text-(length:--sig-text-xs) tracking-wide text-sig-dim ${className}`}>{children}</div>
  );
}

type StatCellProps = {
  readonly label: string;
  readonly value: ReactNode;
  readonly valueClass?: string;
};

export function StatCell({ label, value, valueClass = "" }: StatCellProps) {
  return (
    <div className="bg-sig-bg/60 border border-sig-border rounded-[10px] p-2 text-center min-w-0">
      <div className={`text-(length:--sig-text-md) text-sig-bright truncate ${valueClass}`}>
        {value}
      </div>
      <Label className="mt-0.5">{label}</Label>
    </div>
  );
}

type RouteEndpointProps = {
  readonly label: string;
  readonly gate?: string;
  readonly name: string;
  readonly time?: string;
  readonly actual?: boolean;
  readonly late?: boolean;
};

export function RouteEndpoint({ label, gate, name, time, actual, late }: RouteEndpointProps) {
  return (
    <Card className="p-2.5">
      <Label>{gate ? `${label} · GATE ${gate}` : label}</Label>
      <div className="text-(length:--sig-text-sm) text-sig-bright mt-1">{name}</div>
      {time && (
        <div className={`text-(length:--sig-text-xs) mt-1 ${late ? "text-sig-warn" : "text-sig-text"}`}>
          {time}
          {actual ? "" : " est"}
        </div>
      )}
    </Card>
  );
}
