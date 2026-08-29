import type { ReactNode } from "react";

enum DossierBandScaleClassName {
  ActiveLabel = "font-bold text-(--dossier-accent)",
  InactiveLabel = "text-sig-dim",
}

type DossierBand = Readonly<{
  id: string | number;
  className: string;
  label: string;
}>;

type DossierBandScaleProps<TBand extends DossierBand> = Readonly<{
  activeBand: TBand;
  bands: readonly TBand[];
  detail: ReactNode;
  tickLabel: (band: TBand) => ReactNode;
  value: ReactNode;
}>;

export function DossierBandScale<TBand extends DossierBand>({
  activeBand,
  bands,
  detail,
  tickLabel,
  value,
}: DossierBandScaleProps<TBand>) {
  const orderedBands = [...bands].reverse();
  return (
    <div className={`${activeBand.className} flex flex-col gap-2`}>
      <div className="relative">
        <div className="flex h-3 w-full rounded-[3px] overflow-hidden">
          {orderedBands.map((band) => (
            <div
              key={band.id}
              className={`${band.className} flex-1 bg-(--intensity-color)`}
            />
          ))}
        </div>
        <div className="absolute inset-x-0 -top-1 flex">
          {orderedBands.map((band) => (
            <div key={band.id} className="relative flex-1 h-0">
              {band.id === activeBand.id && (
                <div className="absolute left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-[5px] border-t-sig-bright" />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex w-full">
        {orderedBands.map((band) => {
          const active = band.id === activeBand.id;
          return (
            <span
              key={band.id}
              className={`${band.className} flex-1 text-center text-[9px] font-mono leading-none ${active ? DossierBandScaleClassName.ActiveLabel : DossierBandScaleClassName.InactiveLabel}`}
            >
              {tickLabel(band)}
            </span>
          );
        })}
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-(length:--sig-text-md) text-(--dossier-accent) font-bold leading-none shrink-0">
          {value}
        </span>
        <span className="text-(length:--sig-text-xs) text-sig-bright tracking-wide shrink-0">
          {activeBand.label}
        </span>
        <span className="text-(length:--sig-text-xs) text-sig-dim truncate">
          · {detail}
        </span>
      </div>
    </div>
  );
}
