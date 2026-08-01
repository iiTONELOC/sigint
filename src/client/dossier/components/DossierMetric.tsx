import type { ReactNode } from "react";

export enum DossierMetricValueClass {
  Large = "text-(length:--sig-text-lg) text-sig-bright font-bold font-mono",
  Medium = "text-(length:--sig-text-md) text-sig-bright font-mono",
  Title = "text-(length:--sig-text-title) text-sig-bright font-bold",
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
