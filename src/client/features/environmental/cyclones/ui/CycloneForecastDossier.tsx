import type { CSSProperties, ReactNode } from "react";
import { Wind } from "lucide-react";
import { Domain } from "@shared/domain/identity";
import { bearingDegrees, haversineKm } from "@shared/geo";
import { compassPointForDegrees } from "@shared/domain/compass";
import { MS_PER_HOUR, MS_PER_SECOND } from "@shared/time";
import type { FeatureDossierProps } from "@/features/base/presentation";
import { useSourceEntity } from "@/features/base/useFreshEntity";
import { useUI } from "@/context/UIContext";
import { formatLat, formatLon } from "@/geo";
import { formatDuration, formatTime } from "@/time";
import { formatKtMph, formatKtShort, formatNauticalMiles, kmToNm } from "@/measurements";
import {
  CYCLONE_CATEGORY_METADATA,
  SaffirSimpson,
  cycloneCategoryShortLabel,
  type CycloneForecastPointData,
  type ForecastPoint,
} from "@shared/domain/cyclones";
import { BASIN_LABEL } from "@shared/cyclonesSeason";
import {
  DossierCard,
  DossierLabel,
  DossierSectionLabel,
  DossierToolbar,
  useDossierFocus,
} from "@/dossier";
import { isCyclonePoint, type CyclonePoint } from "../data/codec";
import { cycloneForecastPoint } from "../data/forecastProjection";
import { categoryShort, windColor } from "../classification";
import { leadTime, trackErrorText } from "../forecastDefinition";
import { formatPressureMb } from "../formatters/units";
import { CycloneForecastTimeline } from "./CycloneForecastTimeline";
import { CycloneForecastMiniMap } from "./CycloneForecastMiniMap";
import { CycloneIntensityCurve } from "./CycloneIntensityCurve";

type Props = FeatureDossierProps<Domain.CyclonesForecast>;

enum ForecastDossierClassName {
  Column = "min-w-0 flex flex-col",
  Padded = "p-3",
  InlineLabel = "inline",
  Bright = "text-(length:--sig-text-md) text-sig-bright font-mono",
  Clip = "min-w-0",
}

enum ForecastDossierText {
  Forecast = "FORECAST",
  OpenStorm = "OPEN STORM DOSSIER ›",
  Passed = "passed",
}

function Stat({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className={ForecastDossierClassName.Clip}>
      <DossierLabel>{label}</DossierLabel>
      <div className="text-(length:--sig-text-md) text-sig-bright font-mono mt-0.5 wrap-anywhere">{children}</div>
    </div>
  );
}

function badgeText(data: CycloneForecastPointData): string {
  return data.saffirSimpson > SaffirSimpson.None
    ? `CAT ${data.saffirSimpson}`
    : cycloneCategoryShortLabel(data.category);
}

function validLabel(issuedAt: string, data: CycloneForecastPointData): string {
  const issuedMs = Date.parse(issuedAt);
  return Number.isFinite(issuedMs)
    ? formatTime(new Date(issuedMs + data.fcstHour * MS_PER_HOUR).toISOString())
    : data.validTime;
}

function hoursUntil(parent: CyclonePoint | null, fcstHour: number): number | null {
  if (!parent) return null;
  const issuedAt = Date.parse(parent.data.lastUpdate);
  if (!Number.isFinite(issuedAt)) return null;
  return fcstHour - (Date.now() - issuedAt) / MS_PER_HOUR;
}

function ForecastHeader({ data, parent }: Readonly<{ data: CycloneForecastPointData; parent: CyclonePoint | null }>) {
  const hours = hoursUntil(parent, data.fcstHour);
  return (
    <DossierCard className="p-3 grid grid-cols-[auto_minmax(0,1fr)] gap-3 items-center">
      <div className="w-20 h-16 rounded-[10px] border-2 border-(--dossier-accent) text-(--dossier-accent) flex flex-col items-center justify-center">
        <span className="text-(length:--sig-text-title) font-bold leading-none">{categoryShort(data.maxWindKt)}</span>
        <span className="text-(length:--sig-text-xs) tracking-wider mt-1">{ForecastDossierText.Forecast}</span>
      </div>
      <div className={ForecastDossierClassName.Clip}>
        <div className="text-(length:--sig-text-md) text-sig-bright font-bold truncate">
          {CYCLONE_CATEGORY_METADATA[data.category].label}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          <span><DossierLabel className={ForecastDossierClassName.InlineLabel}>VALID </DossierLabel><span className={ForecastDossierClassName.Bright}>{data.validTime}</span></span>
          {hours !== null && (
            <span>
              <DossierLabel className={ForecastDossierClassName.InlineLabel}>IN </DossierLabel>
              <span className={ForecastDossierClassName.Bright}>
                {hours > 0 ? formatDuration((hours * MS_PER_HOUR) / MS_PER_SECOND) : ForecastDossierText.Passed}
              </span>
            </span>
          )}
        </div>
      </div>
    </DossierCard>
  );
}

function PointStats({ data, parent, forecast }: Readonly<{
  data: CycloneForecastPointData;
  parent: CyclonePoint | null;
  forecast: ForecastPoint | undefined;
}>) {
  const windDelta = parent ? data.maxWindKt - parent.data.maxWindKt : null;
  const distanceKm = parent && forecast ? haversineKm(parent.lat, parent.lon, forecast.lat, forecast.lon) : null;
  const bearing = parent && forecast ? Math.round(bearingDegrees(parent.lat, parent.lon, forecast.lat, forecast.lon)) : null;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
      <Stat label="WINDS">
        {formatKtMph(data.maxWindKt)}
        {windDelta ? <span className={windDelta > 0 ? "text-sig-danger ml-1.5" : "text-sig-quakes ml-1.5"}>{windDelta > 0 ? "+" : ""}{windDelta}</span> : null}
      </Stat>
      <Stat label="CATEGORY">
        {parent ? `${categoryShort(parent.data.maxWindKt)} → ` : ""}
        <span className="text-(--dossier-accent)">{categoryShort(data.maxWindKt)}</span>
      </Stat>
      {data.minPressureMb != null && <Stat label="PRESSURE">{formatPressureMb(data.minPressureMb)}</Stat>}
      <Stat label="TRACK ERROR">{trackErrorText(data.errorRadiusNm)}</Stat>
      {distanceKm !== null && <Stat label="DISTANCE">{formatNauticalMiles(kmToNm(distanceKm))}</Stat>}
      {bearing !== null && <Stat label="BEARING">{`${bearing}° ${compassPointForDegrees(bearing)}`}</Stat>}
      {distanceKm !== null && data.fcstHour > 0 && (
        <Stat label="AVG MOTION">{formatKtShort(Math.round(kmToNm(distanceKm) / data.fcstHour))}</Stat>
      )}
    </div>
  );
}

function ParentStrip({ parent, onOpen }: Readonly<{ parent: CyclonePoint; onOpen: () => void }>) {
  const { data } = parent;
  return (
    <DossierCard className="p-3 flex flex-wrap items-center justify-between gap-3">
      <div className={ForecastDossierClassName.Clip}>
        <DossierLabel>PART OF</DossierLabel>
        <div className="text-(length:--sig-text-md) text-sig-bright truncate">
          {data.name} · {BASIN_LABEL[data.basin]} · {data.stormId} · {categoryShort(data.maxWindKt)} · {formatKtShort(data.maxWindKt)} now
        </div>
      </div>
      <button type="button" onClick={onOpen} className="text-(length:--sig-text-md) text-sig-accent hover:text-sig-bright cursor-pointer">
        {ForecastDossierText.OpenStorm}
      </button>
    </DossierCard>
  );
}

function ForecastBody({ data, parent }: Readonly<{ data: CycloneForecastPointData; parent: CyclonePoint }>) {
  const { setSelected } = useUI();
  const forecast = parent.data.forecast.find((point) => point.fcstHour === data.fcstHour);
  const position = forecast ? `${formatLat(forecast.lat)} · ${formatLon(forecast.lon)}` : null;
  return (
    <>
      <section aria-label="Forecast timeline">
        <DossierSectionLabel>FORECAST TIMELINE</DossierSectionLabel>
        <DossierCard className={ForecastDossierClassName.Padded}>
          <CycloneForecastTimeline
            currentWindKt={parent.data.maxWindKt}
            forecast={parent.data.forecast}
            issuedAt={parent.data.lastUpdate}
            selectedHour={data.fcstHour}
            onSelect={(point) => setSelected(point ? cycloneForecastPoint(parent, point) : parent)}
          />
          {position && (
            <div className="mt-3 pt-3 border-t border-dashed border-sig-border">
              <DossierLabel className={ForecastDossierClassName.InlineLabel}>POSITION </DossierLabel>
              <span className={ForecastDossierClassName.Bright}>{position}</span>
            </div>
          )}
        </DossierCard>
      </section>
      <div className="grid gap-3 grid-cols-1 @min-[45rem]/dossier:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-stretch">
        <section aria-label="Track" className={ForecastDossierClassName.Column}>
          <DossierSectionLabel>TRACK</DossierSectionLabel>
          <DossierCard className="p-2 flex-1 flex flex-col">
            <CycloneForecastMiniMap item={parent} focus={forecast} hazards={parent.data.hazards} mapClassName="h-72 @min-[45rem]/dossier:h-96" />
          </DossierCard>
        </section>
        <section aria-label="At this point" className={ForecastDossierClassName.Column}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <DossierSectionLabel>AT THIS POINT</DossierSectionLabel>
            <DossierLabel className="min-w-0 truncate mb-2">{validLabel(parent.data.lastUpdate, data)}</DossierLabel>
          </div>
          <DossierCard className="p-3 flex-1 flex flex-col gap-3">
            <PointStats data={data} parent={parent} forecast={forecast} />
            <div className="pt-3 border-t border-dashed border-sig-border">
              <CycloneIntensityCurve storm={parent.data} markerHour={data.fcstHour} />
            </div>
          </DossierCard>
        </section>
      </div>
      <ParentStrip parent={parent} onOpen={() => setSelected(parent)} />
    </>
  );
}

export function CycloneForecastDossier({ item, isolateMode, onLocate, onFocus, onSolo, onClose }: Props) {
  const data = item.data;
  const closeBtnRef = useDossierFocus(item.id);
  const entity = useSourceEntity(Domain.Cyclones, data.parentEntityId);
  const parent = isCyclonePoint(entity) ? entity : null;
  return (
    <div className="h-full min-w-0 flex flex-col" style={{ "--dossier-accent": windColor(data.maxWindKt) } as CSSProperties}>
      <DossierToolbar
        icon={Wind}
        title={`${data.parentName} · ${leadTime(data.fcstHour)}`}
        subtitle={`${CYCLONE_CATEGORY_METADATA[data.category].label} (forecast)`}
        badge={badgeText(data)}
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="@container/dossier flex-1 min-w-0 overflow-y-auto sigint-scroll p-3">
        <div className="w-full max-w-275 mx-auto flex flex-col gap-3">
          <ForecastHeader data={data} parent={parent} />
          {parent ? (
            <ForecastBody data={data} parent={parent} />
          ) : (
            <DossierCard className={ForecastDossierClassName.Padded}><PointStats data={data} parent={null} forecast={undefined} /></DossierCard>
          )}
        </div>
      </div>
    </div>
  );
}
