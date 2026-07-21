import { Navigation, LocateFixed } from "lucide-react";
import { formatKtShort, ktToMph } from "@/lib/format/units";
import type { CycloneData } from "../types";
import { windTrend, pressureTrend, pressureRateHpaPerH, WIND_TREND_LABEL, PRESS_TREND_LABEL } from "../data/intensity";
import { windColor } from "../classification";
import { StatBox, StatValue, StatTrend } from "./cycloneKit";
import { CycloneWindsock } from "./CycloneWindsock";
import { CyclonePressureGauge } from "./CyclonePressureGauge";

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];
const COMPASS_STEP_DEG = 360 / 16;
function cardinal(deg: number): string {
  const idx = Math.round((((deg % 360) + 360) % 360) / COMPASS_STEP_DEG) % 16;
  return COMPASS[idx] ?? "N";
}

// VITALS — MAX WIND (lead, category-accent left border) + PRESSURE boxes with
// real trends (windTrend/pressureTrend over pastTrack + forecast), and a
// MOVEMENT strip whose arrow rotates to the storm's heading. Boxes, not dials.

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
  const w = WIND_TREND_LABEL[windTrendValue];
  const p = PRESS_TREND_LABEL[pressureTrendValue];
  const pressRate = pressureRateHpaPerH(data);
  const pressRateText =
    pressRate == null ? null : `${pressRate > 0 ? "+" : ""}${pressRate.toFixed(1)} hPa/h`;
  const { movementDir, movementSpeedKt } = data;
  const hasMovement = movementDir != null && movementSpeedKt != null;

  return (
    <div className="@container/vitals flex flex-col gap-2.5 h-full">
      <div className="grid grid-cols-1 @min-[16rem]/vitals:grid-cols-2 gap-2.5">
        <StatBox label="MAX WIND" lead className="relative">
          <div className="absolute top-2.5 right-3">
            <CycloneWindsock maxWindKt={data.maxWindKt} />
          </div>
          <StatValue value={data.maxWindKt} unit="kt" />
          <StatTrend tone={w.tone}>
            <span style={{ color: windColor(data.maxWindKt) }}>{ktToMph(data.maxWindKt)} mph</span> · {w.text}
            {windTrendValue === "unknown" ? "" : " since prior advisory"}
          </StatTrend>
        </StatBox>
        {data.minPressureMb != null && (
          <StatBox label="PRESSURE" className="relative">
            <div className="absolute top-2.5 right-3">
              <CyclonePressureGauge pressureHpa={data.minPressureMb} />
            </div>
            <StatValue value={data.minPressureMb} unit="hPa" />
            <StatTrend tone={p.tone}>
              {pressRateText ? `${pressRateText} · ${p.text}` : p.text}
              {pressureTrendValue === "unknown" ? "" : " since prior advisory"}
            </StatTrend>
          </StatBox>
        )}
      </div>
      {hasMovement && (
        <div className="flex items-center justify-between gap-2 min-w-0 bg-sig-panel border border-sig-border rounded-[12px] px-3 py-2.5">
          <span className="flex items-center gap-2 text-(length:--sig-text-xs) tracking-wide text-sig-text shrink-0">
            <Navigation
              className="w-3.5 h-3.5 text-(--dossier-accent)"
              style={{ transform: `rotate(${movementDir}deg)` }}
              aria-hidden="true"
            />
            MOVING
          </span>
          <span className="text-(length:--sig-text-md) text-sig-bright font-mono truncate">
            {cardinal(movementDir)} {movementDir}° · {formatKtShort(movementSpeedKt)}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 min-w-0 bg-sig-panel border border-sig-border rounded-[12px] px-3 py-2.5">
        <span className="flex items-center gap-2 text-(length:--sig-text-xs) tracking-wide text-sig-text shrink-0">
          <LocateFixed className="w-3.5 h-3.5 text-(--dossier-accent)" aria-hidden="true" />
          POSITION
        </span>
        <span className="text-(length:--sig-text-md) text-sig-bright font-mono truncate">
          {Math.abs(lat).toFixed(2)}°{lat >= 0 ? "N" : "S"} · {Math.abs(lon).toFixed(2)}°{lon >= 0 ? "E" : "W"}
        </span>
      </div>
    </div>
  );
}
