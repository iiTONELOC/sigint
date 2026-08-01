import { Navigation, LocateFixed } from "lucide-react";
import { formatKtShort, ktToMph } from "@/measurements";
import { formatLat, formatLon } from "@/lib/format/geoFormat";
import type { CycloneData } from "../types";
import {
  pressureRateHpaPerH,
  pressureTrend,
  pressureTrendLabel,
  windTrend,
  windTrendLabel,
} from "../data/intensity";
import { StatBox, StatValue, StatTrend } from "./cycloneKit";
import { CycloneWindsock } from "./CycloneWindsock";
import { CyclonePressureGauge } from "./CyclonePressureGauge";
import { compassPointForDegrees } from "@shared/domain/compass";

enum CycloneVitalsClassName {
  StatBox = "relative",
  Instrument = "absolute top-2.5 right-3",
  Icon = "w-3.5 h-3.5 text-(--dossier-accent)",
  Value = "text-(length:--sig-text-md) text-sig-bright font-mono truncate",
  Strip = "flex items-center justify-between gap-2 min-w-0 bg-sig-panel border border-sig-border rounded-[12px] px-3 py-2.5",
  StripLabel = "flex items-center gap-2 text-(length:--sig-text-xs) tracking-wide text-sig-text shrink-0",
}

enum CycloneVitalsText {
  PositivePrefix = "+",
  PressureRateSuffix = " hPa/h",
  SincePriorAdvisory = " since prior advisory",
  MiddleDot = " · ",
}

enum CycloneVitalsSvgGeometry {
  IconCenter = 12,
}

function pressureRateText(rate: number | null): string | null {
  if (rate === null) return null;
  const prefix = rate > 0 ? CycloneVitalsText.PositivePrefix : "";
  return `${prefix}${rate.toFixed(1)}${CycloneVitalsText.PressureRateSuffix}`;
}

export function CycloneVitals({
  data,
  lat,
  lon,
}: {
  readonly data: CycloneData;
  readonly lat: number;
  readonly lon: number;
}) {
  const windTrendValue = windTrend(data);
  const pressureTrendValue = pressureTrend(data);
  const windLabel = windTrendLabel(windTrendValue);
  const pressureLabel = pressureTrendLabel(pressureTrendValue);
  const pressRate = pressureRateHpaPerH(data);
  const pressRateText = pressureRateText(pressRate);
  const { movementDir, movementSpeedKt } = data;
  const hasMovement = movementDir != null && movementSpeedKt != null;

  return (
    <div className="@container/vitals flex flex-col gap-2.5 h-full">
      <div className="grid grid-cols-1 @min-[16rem]/vitals:grid-cols-2 gap-2.5">
        <StatBox label="MAX WIND" lead className={CycloneVitalsClassName.StatBox}>
          <div className={CycloneVitalsClassName.Instrument}>
            <CycloneWindsock maxWindKt={data.maxWindKt} />
          </div>
          <StatValue value={data.maxWindKt} unit="kt" />
          <StatTrend tone={windLabel.tone}>
            <span className="text-(--dossier-accent)">
              {ktToMph(data.maxWindKt)} mph
            </span>
            {CycloneVitalsText.MiddleDot}{windLabel.text}
            {windLabel.observed ? CycloneVitalsText.SincePriorAdvisory : ""}
          </StatTrend>
        </StatBox>
        {data.minPressureMb != null && (
          <StatBox label="PRESSURE" className={CycloneVitalsClassName.StatBox}>
            <div className={CycloneVitalsClassName.Instrument}>
              <CyclonePressureGauge pressureHpa={data.minPressureMb} />
            </div>
            <StatValue value={data.minPressureMb} unit="hPa" />
            <StatTrend tone={pressureLabel.tone}>
              {pressRateText
                ? `${pressRateText}${CycloneVitalsText.MiddleDot}${pressureLabel.text}`
                : pressureLabel.text}
              {pressureLabel.observed
                ? CycloneVitalsText.SincePriorAdvisory
                : ""}
            </StatTrend>
          </StatBox>
        )}
      </div>
      {hasMovement && (
        <div className={CycloneVitalsClassName.Strip}>
          <span className={CycloneVitalsClassName.StripLabel}>
            <Navigation
              className={CycloneVitalsClassName.Icon}
              transform={`rotate(${movementDir} ${CycloneVitalsSvgGeometry.IconCenter} ${CycloneVitalsSvgGeometry.IconCenter})`}
              aria-hidden
            />
            MOVING
          </span>
          <span className={CycloneVitalsClassName.Value}>
            {compassPointForDegrees(movementDir)} {movementDir}°
            {CycloneVitalsText.MiddleDot}{formatKtShort(movementSpeedKt)}
          </span>
        </div>
      )}
      <div className={CycloneVitalsClassName.Strip}>
        <span className={CycloneVitalsClassName.StripLabel}>
          <LocateFixed className={CycloneVitalsClassName.Icon} aria-hidden />
          POSITION
        </span>
        <span className={CycloneVitalsClassName.Value}>
          {formatLat(lat)}{CycloneVitalsText.MiddleDot}{formatLon(lon)}
        </span>
      </div>
    </div>
  );
}
