import { formatTempCF } from "../formatters/units";
import {
  fireAnomalyStrength,
  FireTemperatureThreshold,
  frpBand,
} from "../intensity";

enum ThermalPlotValue {
  MaximumKelvin = 400,
  MinimumKelvin = 270,
  PercentageMaximum = 100,
}

enum ThermalChannelGeometry {
  ViewBoxHeight = 12,
  ViewBoxWidth = 100,
}

enum ThermalChannelTone {
  Background = "fill-sig-dim",
  Fire = "fill-(--dossier-accent)",
}

function percentage(kelvin: number): number {
  const range = ThermalPlotValue.MaximumKelvin -
    ThermalPlotValue.MinimumKelvin;
  const value =
    ((kelvin - ThermalPlotValue.MinimumKelvin) / range) *
    ThermalPlotValue.PercentageMaximum;
  return Math.min(
    ThermalPlotValue.PercentageMaximum,
    Math.max(0, value),
  );
}

export function ThermalSignature({
  fireK,
  bgK,
  frp,
}: {
  readonly fireK: number;
  readonly bgK: number;
  readonly frp: number;
}) {
  const deltaKelvin = fireK - bgK;
  const band = frpBand(frp);
  const anomaly = fireAnomalyStrength(deltaKelvin);

  return (
    <div className={`${band.className} flex flex-col gap-2.5`}>
      <Channel
        label="I4 fire"
        kelvin={fireK}
        percentage={percentage(fireK)}
        tone={ThermalChannelTone.Fire}
      />
      <Channel
        label="I5 bg"
        kelvin={bgK}
        percentage={percentage(bgK)}
        tone={ThermalChannelTone.Background}
      />

      <div className="flex items-baseline gap-2 pt-1 border-t border-sig-border/60">
        <span className="text-(length:--sig-text-md) text-(--dossier-accent) font-bold font-mono leading-none">
          ΔT {deltaKelvin.toFixed(0)} K
        </span>
        <span className="text-(length:--sig-text-xs) text-sig-bright tracking-wide">
          {anomaly} anomaly
        </span>
        <span className="text-(length:--sig-text-xs) text-sig-dim truncate">
          · detection ≥ {FireTemperatureThreshold.DetectionDeltaKelvin} K
        </span>
      </div>
    </div>
  );
}

function Channel({
  label,
  kelvin,
  percentage: width,
  tone,
}: {
  readonly label: string;
  readonly kelvin: number;
  readonly percentage: number;
  readonly tone: ThermalChannelTone;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-12 shrink-0 text-(length:--sig-text-xs) tracking-wider text-sig-dim">
        {label}
      </span>
      <svg
        viewBox={`0 0 ${ThermalChannelGeometry.ViewBoxWidth} ${ThermalChannelGeometry.ViewBoxHeight}`}
        preserveAspectRatio="none"
        className="flex-1 h-3 rounded-[3px] overflow-hidden"
        aria-hidden
      >
        <rect
          width={ThermalChannelGeometry.ViewBoxWidth}
          height={ThermalChannelGeometry.ViewBoxHeight}
          className="fill-sig-bg/60"
        />
        <rect
          width={width}
          height={ThermalChannelGeometry.ViewBoxHeight}
          className={tone}
        />
      </svg>
      <span className="w-28 shrink-0 text-right font-mono text-(length:--sig-text-xs) text-sig-bright">
        {Math.round(kelvin)} K · {formatTempCF(kelvin)}
      </span>
    </div>
  );
}
