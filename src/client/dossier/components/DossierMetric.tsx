import { LocateFixed } from "lucide-react";
import { formatLat, formatLon } from "@/geo";
import {
  recordLatitude,
  recordLongitude,
  type PositionedRecord,
} from "@/workers/data/source-model/position";
import type { ReactNode } from "react";

const DOSSIER_UNKNOWN_VALUE = "unknown";

export enum DossierMetricValueClass {
  Large = "text-(length:--sig-text-lg) text-sig-bright font-bold font-mono",
  Medium = "text-(length:--sig-text-md) text-sig-bright font-mono",
  Title = "text-(length:--sig-text-title) text-sig-bright font-bold",
}

export function DossierLabel(
  { children, className = "" }: Readonly<{ children: ReactNode; className?: string }>,
) {
  return (
    <div className={`text-(length:--sig-text-xs) tracking-wide text-sig-dim ${className}`}>
      {children}
    </div>
  );
}

export function DossierStatCell(
  { label, value, valueClass = "" }:
    Readonly<{ label: string; value: ReactNode; valueClass?: string }>,
) {
  return (
    <div className="bg-sig-bg/60 border border-sig-border rounded-[10px] p-2 text-center min-w-0">
      <div className={`text-(length:--sig-text-md) text-sig-bright truncate ${valueClass}`}>
        {value}
      </div>
      <DossierLabel className="mt-0.5">{label}</DossierLabel>
    </div>
  );
}

type DossierMetricProps = Readonly<{
  label: ReactNode;
  value: ReactNode;
  valueClass?: DossierMetricValueClass;
}>;

export function DossierMetric({
  label,
  value,
  valueClass = DossierMetricValueClass.Medium,
}: DossierMetricProps) {
  return (
    <div className="leading-none">
      <div className={valueClass}>{value}</div>
      <div className="text-(length:--sig-text-xs) tracking-wider text-sig-dim mt-1">
        {label}
      </div>
    </div>
  );
}

export function DossierRow({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  if (!value || value.toLowerCase() === DOSSIER_UNKNOWN_VALUE) return null;
  return (
    <div className="flex justify-between text-xs gap-2">
      <span className="text-sig-accent shrink-0">{label}</span>
      <span className="text-sig-bright text-right truncate font-mono">
        {value}
      </span>
    </div>
  );
}

export function DossierPositionRow({
  className = "",
  item,
}: Readonly<{ className?: string; item: PositionedRecord }>) {
  return (
    <div className={`flex items-center justify-between bg-sig-panel border border-sig-border rounded-[10px] px-3 py-1.5 ${className}`}>
      <span className="flex items-center gap-1.5 text-(length:--sig-text-xs) text-sig-text">
        <LocateFixed className="w-3.5 h-3.5 text-(--dossier-accent)" aria-hidden={true} />
        POSITION
      </span>
      <span className="text-(length:--sig-text-xs) text-sig-bright font-mono">
        {formatLat(recordLatitude(item))} · {formatLon(recordLongitude(item))}
      </span>
    </div>
  );
}
