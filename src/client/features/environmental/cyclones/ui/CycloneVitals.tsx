import { Navigation, LocateFixed } from "lucide-react";
import type { ReactNode } from "react";
import { formatKtShort, ktToMph } from "@/measurements";
import { formatLat, formatLon } from "@/geo";
import { estimatedStormPosition, type CycloneData } from "@shared/domain/cyclones";
import {
  fixNewerThanAdvisory,
  pressureRateHpaPerH,
  pressureTrend,
  pressureTrendLabel,
  CycloneTrendTone,
  trendWindowHours,
  windTrend,
  windTrendLabel,
} from "../data/intensity";
import { CycloneWindsock } from "./CycloneWindsock";
import { CyclonePressureGauge } from "./CyclonePressureGauge";
import { compassPointForDegrees } from "@shared/domain/compass";
import { latitudeOf, longitudeOf, type GeoPoint } from "@shared/geo";

enum CycloneVitalsClassName {
  Instrument = "absolute top-2.5 right-3",
  Icon = "w-3.5 h-3.5 text-(--dossier-accent) origin-center",
}

enum CycloneVitalsText {
  PositivePrefix = "+",
  PressureRateSuffix = " hPa/h",
  MiddleDot = " · ",
  BestTrack = "best track",
  EstimatedNow = "est. now",
}

function StatBox({
  label,
  children,
  lead = false,
}: Readonly<{ label: string; children: ReactNode; lead?: boolean }>) {
  const leadClassName = lead ? "border-l-2 border-l-(--dossier-accent)" : "";
  return (
    <div
      className={`relative bg-sig-panel border border-sig-border rounded-[10px] px-3 py-2.5 min-w-0 h-full flex flex-col ${leadClassName}`}
    >
      <div className="text-(length:--sig-text-xs) tracking-widest text-sig-dim">{label}</div>
      {children}
    </div>
  );
}

function StatValue({ value, unit }: Readonly<{ value: ReactNode; unit: string }>) {
  return (
    <div className="text-(length:--sig-text-cqtitle) text-sig-bright leading-none mt-1">
      {value}
      <span className="text-(length:--sig-text-xs) text-sig-dim ml-1">{unit}</span>
    </div>
  );
}

function trendClassName(tone: CycloneTrendTone): string {
  switch (tone) {
    case CycloneTrendTone.Bad:
      return "text-sig-danger";
    case CycloneTrendTone.Good:
      return "text-sig-quakes";
    case CycloneTrendTone.Dim:
      return "text-sig-text";
  }
}

function StatTrend({ children, tone }: Readonly<{ children: ReactNode; tone: CycloneTrendTone }>) {
  return (
    <div className={`text-(length:--sig-text-xs) mt-auto pt-1.5 ${trendClassName(tone)}`}>
      {children}
    </div>
  );
}

function trendWindowText(hours: number | null): string {
  return hours === null ? "" : ` past ${Math.round(hours)}h`;
}

function pressureRateText(rate: number | null): string | null {
  if (rate === null) return null;
  const prefix = rate > 0 ? CycloneVitalsText.PositivePrefix : "";
  return `${prefix}${rate.toFixed(1)}${CycloneVitalsText.PressureRateSuffix}`;
}

export function CycloneVitals({
  data,
  position,
}: Readonly<{ data: CycloneData; position: GeoPoint }>) {
  const windLabel = windTrendLabel(windTrend(data));
  const pressureLabel = pressureTrendLabel(pressureTrend(data));
  const pressRateText = pressureRateText(pressureRateHpaPerH(data));
  const windowText = trendWindowText(trendWindowHours(data));
  const newerFix = fixNewerThanAdvisory(data);
  const { movementDir, movementSpeedKt } = data;
  const hasMovement = movementDir != null && movementSpeedKt != null;
  const estimate = estimatedStormPosition(position, data, Date.now());

  return (
    <div className="@container/vitals h-full">
      <div className="grid grid-cols-1 @min-[16rem]/vitals:grid-cols-2 @min-[44rem]/vitals:grid-cols-4 gap-2.5">
        <StatBox label="MAX WIND" lead>
          <div className={CycloneVitalsClassName.Instrument}>
            <CycloneWindsock maxWindKt={data.maxWindKt} />
          </div>
          <StatValue value={data.maxWindKt} unit="kt" />
          <StatTrend tone={windLabel.tone}>
            <span className="text-(--dossier-accent)">{ktToMph(data.maxWindKt)} mph</span>
            {CycloneVitalsText.MiddleDot}{windLabel.text}
            {windLabel.observed ? windowText : ""}
          </StatTrend>
          {newerFix && (
            <StatTrend tone={CycloneTrendTone.Dim}>
              {CycloneVitalsText.BestTrack} {formatKtShort(newerFix.vmaxKt)}
            </StatTrend>
          )}
        </StatBox>
        {data.minPressureMb != null && (
          <StatBox label="PRESSURE">
            <div className={CycloneVitalsClassName.Instrument}>
              <CyclonePressureGauge pressureHpa={data.minPressureMb} />
            </div>
            <StatValue value={data.minPressureMb} unit="hPa" />
            <StatTrend tone={pressureLabel.tone}>
              {pressRateText
                ? `${pressRateText}${CycloneVitalsText.MiddleDot}${pressureLabel.text}`
                : pressureLabel.text}
              {pressureLabel.observed ? windowText : ""}
            </StatTrend>
            {newerFix?.minPressureMb != null && (
              <StatTrend tone={CycloneTrendTone.Dim}>
                {CycloneVitalsText.BestTrack} {newerFix.minPressureMb} hPa
              </StatTrend>
            )}
          </StatBox>
        )}
        {hasMovement && (
          <StatBox label="MOVING">
            <div className={CycloneVitalsClassName.Instrument}>
              <Navigation
                className={CycloneVitalsClassName.Icon}
                style={{ transform: `rotate(${movementDir}deg)` }}
                aria-hidden
              />
            </div>
            <StatValue value={`${compassPointForDegrees(movementDir)} ${movementDir}°`} unit="" />
            <StatTrend tone={CycloneTrendTone.Dim}>{formatKtShort(movementSpeedKt)}</StatTrend>
          </StatBox>
        )}
        <StatBox label="POSITION">
          <div className={CycloneVitalsClassName.Instrument}>
            <LocateFixed className={CycloneVitalsClassName.Icon} aria-hidden />
          </div>
          <StatValue value={<span className="flex flex-col"><span>{formatLat(latitudeOf(position))}</span><span>{formatLon(longitudeOf(position))}</span></span>} unit="" />
          <StatTrend tone={CycloneTrendTone.Dim}>
            {CycloneVitalsText.EstimatedNow} {formatLat(latitudeOf(estimate))}{CycloneVitalsText.MiddleDot}{formatLon(longitudeOf(estimate))}
          </StatTrend>
        </StatBox>
      </div>
    </div>
  );
}
