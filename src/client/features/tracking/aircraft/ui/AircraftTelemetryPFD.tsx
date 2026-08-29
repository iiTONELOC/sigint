import { PanelSide } from "@/layout-mode/model/layoutMode";
import { DetailField, DossierCard } from "@/dossier";
import { Tape } from "./instruments/Tape";
import { HeadingHSI } from "./instruments/HeadingHSI";
import { VerticalSpeed } from "./instruments/VerticalSpeed";
import { ktToMph } from "@/measurements";
import { TurnDeg } from "@shared/geo";
import type { AircraftData } from "@shared/domain/aircraft";
import { isaTempC } from "../utils/isa";
import {
  aircraftEmergencyPresentation,
  AircraftFlightStatusLabel,
  aircraftVerticalSpeedFpm,
} from "../formatters/presentation";
import { EMPTY_TEXT } from "@shared/text";

enum AircraftTelemetryValue {
  AltitudeFooterDivisor = 1_000,
  AltitudeLabelInterval = 500,
  AltitudePixelsPerUnit = 0.12,
  AltitudeStep = 100,
  PairSize = 2,
  SpeedLabelInterval = 20,
  SpeedPixelsPerUnit = 1.6,
  SpeedStep = 10,
}

enum AircraftTelemetryClassName {
  SideTape = "w-14 shrink-0",
}

enum AircraftTelemetryCornerPosition {
  Accuracy = "bottom-0 right-0",
  Signal = "bottom-0 left-0",
  Source = "top-0 left-0",
}

enum AircraftTelemetryLabel {
  Accuracy = "ACC",
  Autopilot = "AUTOPILOT",
  Drift = "DRIFT",
  IsaDeviation = "ISA DEV",
  OutsideAirTemperature = "OAT",
  Pressure = "QNH",
  Signal = "SIG",
  Source = "SRC",
  Squawk = "SQUAWK",
  State = "STATE",
  TotalAirTemperature = "TAT",
  Wind = "WIND",
  WindComponent = "W-COMP",
}

enum AircraftTelemetryIndex {
  SecondItemOffset = 1,
}

enum AircraftTelemetryPrecision {
  AltitudeThousands = 1,
}

enum AircraftWindPrefix {
  Headwind = "H",
  Tailwind = "T",
}

enum AircraftDriftSide {
  Left = "L",
  Right = "R",
}

type TelemetryStat = Readonly<{
  label: string;
  value: string;
}>;

function Corner({
  pos,
  label,
  value,
}: {
  readonly pos: AircraftTelemetryCornerPosition;
  readonly label: AircraftTelemetryLabel;
  readonly value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className={`absolute ${pos} font-mono leading-none whitespace-nowrap text-[clamp(7px,0.62vw,10px)]`}>
      <span className="text-sig-dim">{label} </span>
      <span className="text-sig-bright">{value}</span>
    </div>
  );
}

function windText(
  direction: number | undefined,
  speed: number | undefined,
): string | null {
  if (direction == null || speed == null) return null;
  return `${Math.round(direction)}° / ${Math.round(speed)} kt`;
}

function windComponents(
  windDirection: number | undefined,
  windSpeed: number | undefined,
  track: number | undefined,
): Readonly<{ head: number; cross: number; side: AircraftDriftSide }> | null {
  if (
    windDirection === undefined ||
    windSpeed === undefined ||
    track === undefined
  ) {
    return null;
  }
  const angle = ((windDirection - track) * Math.PI) / TurnDeg.Half;
  const head = Math.round(windSpeed * Math.cos(angle));
  const cross = windSpeed * Math.sin(angle);
  return {
    head,
    cross: Math.round(Math.abs(cross)),
    side: cross >= 0 ? AircraftDriftSide.Right : AircraftDriftSide.Left,
  };
}

function windComponentText(data: AircraftData): string | null {
  const component = windComponents(data.windDir, data.windSpd, data.heading);
  if (!component) return null;
  const alongTrack = component.head >= 0
    ? `${AircraftWindPrefix.Headwind}${component.head}`
    : `${AircraftWindPrefix.Tailwind}${Math.abs(component.head)}`;
  return `${alongTrack} · X${component.cross}${component.side}`;
}

function isaText(data: AircraftData): string | null {
  if (data.oat === undefined) return null;
  const deviation = Math.round(data.oat - isaTempC(data.altitude ?? 0));
  return `ISA ${deviation >= 0 ? "+" : EMPTY_TEXT}${deviation}`;
}

function driftText(data: AircraftData): string | null {
  if (data.heading === undefined || data.trueHeading === undefined) return null;
  let difference = data.heading - data.trueHeading;
  while (difference > TurnDeg.Half) difference -= TurnDeg.Full;
  while (difference < -TurnDeg.Half) difference += TurnDeg.Full;
  if (Math.abs(difference) < 1) return "0°";
  const side = difference > 0
    ? AircraftDriftSide.Right
    : AircraftDriftSide.Left;
  return `${Math.abs(Math.round(difference))}° ${side}`;
}

function sourceLabel(type: string | undefined): string | null {
  if (!type) return null;
  if (type.startsWith("adsb") || type.startsWith("adsr")) return "ADS-B";
  if (type.startsWith("mlat")) return "MLAT";
  if (type.startsWith("tisb")) return "TIS-B";
  if (type.startsWith("mode_s")) return "MODE-S";
  return type.toUpperCase();
}

function autopilotText(modes: readonly string[] | undefined): string | null {
  if (!modes || modes.length === 0) return null;
  return modes.join(" · ").toUpperCase();
}

function outsideAirTemperature(
  reported: number | undefined,
  altitude: number,
): number | null {
  if (reported != null) return reported;
  return altitude > 0 ? isaTempC(altitude) : null;
}

function outsideAirTemperatureText(
  reported: number | undefined,
  altitude: number,
): string | null {
  const value = outsideAirTemperature(reported, altitude);
  if (value === null) return null;
  const prefix = reported == null ? "~" : EMPTY_TEXT;
  return `${prefix}${Math.round(value)}°C`;
}

function buildTelemetryStats(data: AircraftData): TelemetryStat[] {
  const valueByLabel: Partial<
    Record<AircraftTelemetryLabel, string | null | undefined>
  > = {
    [AircraftTelemetryLabel.Wind]: windText(data.windDir, data.windSpd),
    [AircraftTelemetryLabel.WindComponent]: windComponentText(data),
    [AircraftTelemetryLabel.Drift]: driftText(data),
    [AircraftTelemetryLabel.OutsideAirTemperature]: outsideAirTemperatureText(
      data.oat,
      data.altitude ?? 0,
    ),
    [AircraftTelemetryLabel.IsaDeviation]: isaText(data),
    [AircraftTelemetryLabel.TotalAirTemperature]: data.tat === undefined
      ? null
      : `${Math.round(data.tat)}°C`,
    [AircraftTelemetryLabel.Pressure]: data.navQnh === undefined
      ? null
      : `${Math.round(data.navQnh)} hPa`,
    [AircraftTelemetryLabel.Autopilot]: autopilotText(data.navModes),
  };
  const stats: TelemetryStat[] = [];
  for (const [label, value] of Object.entries(valueByLabel)) {
    if (value) stats.push({ label, value });
  }
  return stats;
}

function telemetryRows(
  stats: readonly TelemetryStat[],
): Array<readonly [TelemetryStat, TelemetryStat?]> {
  const rows: Array<readonly [TelemetryStat, TelemetryStat?]> = [];
  for (
    let index = 0;
    index < stats.length;
    index += AircraftTelemetryValue.PairSize
  ) {
    const first = stats.at(index);
    if (!first) continue;
    rows.push([
      first,
      stats.at(index + AircraftTelemetryIndex.SecondItemOffset),
    ]);
  }
  return rows;
}

export function AircraftTelemetryPFD({ data }: Readonly<{ data: AircraftData }>) {
  const speed = data.speed ?? 0;
  const heading = data.heading ?? 0;
  const altitude = data.altitude ?? 0;
  const fpm = aircraftVerticalSpeedFpm(data.verticalRate);
  const emergency = aircraftEmergencyPresentation(data).active;
  const statRows = telemetryRows(buildTelemetryStats(data));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 w-full max-w-md mx-auto overflow-hidden h-44">
        <div className={AircraftTelemetryClassName.SideTape}>
          <Tape
            value={speed}
            step={AircraftTelemetryValue.SpeedStep}
            labelEvery={AircraftTelemetryValue.SpeedLabelInterval}
            pxPer={AircraftTelemetryValue.SpeedPixelsPerUnit}
            side={PanelSide.Right}
            header="KT"
            footer={`${ktToMph(speed)} mph`}
            format={String}
          />
        </div>
        <div className="relative flex-1 min-w-28">
          <HeadingHSI heading={heading} selectedHeading={data.navHeading} />
          <Corner
            pos={AircraftTelemetryCornerPosition.Source}
            label={AircraftTelemetryLabel.Source}
            value={sourceLabel(data.adsbType)}
          />
          <Corner
            pos={AircraftTelemetryCornerPosition.Signal}
            label={AircraftTelemetryLabel.Signal}
            value={data.rssi === undefined ? null : `${Math.round(data.rssi)} dB`}
          />
          <Corner
            pos={AircraftTelemetryCornerPosition.Accuracy}
            label={AircraftTelemetryLabel.Accuracy}
            value={data.nacP === undefined ? null : `${data.nacP}`}
          />
        </div>
        <div className={AircraftTelemetryClassName.SideTape}>
          <Tape
            value={altitude}
            step={AircraftTelemetryValue.AltitudeStep}
            labelEvery={AircraftTelemetryValue.AltitudeLabelInterval}
            pxPer={AircraftTelemetryValue.AltitudePixelsPerUnit}
            side={PanelSide.Left}
            header="FT"
            footer="x1000"
            selected={data.navAltitudeMcp ?? data.navAltitudeFms}
            format={(value) => (
              value / AircraftTelemetryValue.AltitudeFooterDivisor
            ).toFixed(AircraftTelemetryPrecision.AltitudeThousands)}
          />
        </div>
        <div className={AircraftTelemetryClassName.SideTape}>
          <VerticalSpeed fpm={fpm} />
        </div>
      </div>

      <DossierCard className="p-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <DetailField
            label={AircraftTelemetryLabel.State}
            value={
              data.onGround
                ? AircraftFlightStatusLabel.OnGround
                : AircraftFlightStatusLabel.Airborne
            }
          />
          {data.squawk && (
            <DetailField
              label={AircraftTelemetryLabel.Squawk}
              value={data.squawk}
              align={PanelSide.Right}
              valueClass={emergency ? "text-sig-danger" : EMPTY_TEXT}
            />
          )}
        </div>
        {statRows.length > 0 && (
          <div className="flex flex-col gap-2 pt-2 border-t border-sig-border/50">
            {statRows.map(([a, b]) => (
              <div key={a.label} className="flex justify-between gap-4">
                <DetailField label={a.label} value={a.value} />
                {b && (
                  <DetailField
                    label={b.label}
                    value={b.value}
                    align={PanelSide.Right}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </DossierCard>
    </div>
  );
}
