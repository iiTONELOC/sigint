import { PanelSide } from "@/layout-mode/model/layoutMode";
import { DetailField, DossierCard } from "@/dossier";
import { HeadingHSI } from "./instruments/HeadingHSI";
import { TurnCoordinator } from "./instruments/TurnCoordinator";
import {
  AirspeedIndicator,
  Altimeter,
  AttitudeIndicator,
  VerticalSpeedIndicator,
} from "./instruments/FlightInstruments";
import { formatKtShort } from "@/measurements";
import { TurnDeg } from "@shared/geo";
import type { AircraftData } from "@shared/domain/aircraft";
import { flightPathAngleDegrees, isaTempC } from "../utils/isa";
import {
  aircraftEmergencyPresentation,
  AircraftFlightStatusLabel,
  aircraftVerticalSpeedFpm,
} from "../formatters/presentation";
import { EMPTY_TEXT } from "@shared/text";

enum AircraftTelemetryClassName {
  GaugeGrid = "grid grid-cols-2 @min-[22rem]/gauges:grid-cols-3 gap-1.5 max-w-[42rem] mx-auto",
  GaugeTile = "bg-sig-bg rounded-[10px] border border-sig-border p-1",
}

enum AircraftTelemetryLabel {
  Accuracy = "ACC",
  Autopilot = "AUTOPILOT",
  Drift = "DRIFT",
  FlightPath = "FPA",
  IsaDeviation = "ISA DEV",
  OutsideAirTemperature = "OAT",
  Pressure = "QNH",
  Signal = "SIG",
  Source = "SRC",
  Squawk = "SQUAWK",
  State = "STATE",
  TotalAirTemperature = "TAT",
  TurnRate = "TURN",
  Wind = "WIND",
  WindComponent = "W-COMP",
}

enum AircraftTelemetryIndex {
  SecondItemOffset = 1,
  PairSize = 2,
}

const TURN_RATE_DECIMALS = 1;

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

function windText(
  direction: number | undefined,
  speed: number | undefined,
): string | null {
  if (direction == null || speed == null) return null;
  return `${Math.round(direction)}° / ${formatKtShort(Math.round(speed))}`;
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

function flightPathText(flightPath: number | null): string | null {
  return flightPath === null ? null : `${flightPath > 0 ? "+" : EMPTY_TEXT}${flightPath.toFixed(1)}°`;
}

function turnRateText(rate: number | undefined): string | null {
  return rate === undefined
    ? null
    : `${rate.toFixed(TURN_RATE_DECIMALS)}°/s`;
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

function aircraftFlightPath(data: AircraftData): number | null {
  return data.verticalRate === undefined || data.speed === undefined
    ? null
    : flightPathAngleDegrees(data.verticalRate, data.speed);
}

function buildTelemetryStats(data: AircraftData): TelemetryStat[] {
  const valueByLabel: Partial<
    Record<AircraftTelemetryLabel, string | null | undefined>
  > = {
    [AircraftTelemetryLabel.Wind]: windText(data.windDir, data.windSpd),
    [AircraftTelemetryLabel.WindComponent]: windComponentText(data),
    [AircraftTelemetryLabel.FlightPath]: flightPathText(aircraftFlightPath(data)),
    [AircraftTelemetryLabel.Drift]: driftText(data),
    [AircraftTelemetryLabel.TurnRate]: turnRateText(data.trackRate),
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
    [AircraftTelemetryLabel.Source]: sourceLabel(data.adsbType),
    [AircraftTelemetryLabel.Signal]: data.rssi === undefined ? null : `${Math.round(data.rssi)} dB`,
    [AircraftTelemetryLabel.Accuracy]: data.nacP === undefined ? null : `${data.nacP}`,
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
    index += AircraftTelemetryIndex.PairSize
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
    <div className="flex-1 flex flex-col gap-2">
      <div className="@container/gauges">
        <div className={AircraftTelemetryClassName.GaugeGrid}>
          <div className={AircraftTelemetryClassName.GaugeTile}><AirspeedIndicator knots={speed} /></div>
          <div className={AircraftTelemetryClassName.GaugeTile}><AttitudeIndicator bankDegrees={data.roll} flightPathDegrees={aircraftFlightPath(data)} /></div>
          <div className={AircraftTelemetryClassName.GaugeTile}>
            <Altimeter feet={altitude} selectedFeet={data.navAltitudeMcp ?? data.navAltitudeFms} />
          </div>
          <div className={AircraftTelemetryClassName.GaugeTile}>
            <TurnCoordinator bankDegrees={data.roll} turnRateDegreesPerSecond={data.trackRate} airspeedKnots={data.tas ?? speed} />
          </div>
          <div className={AircraftTelemetryClassName.GaugeTile}><HeadingHSI heading={heading} selectedHeading={data.navHeading} /></div>
          <div className={AircraftTelemetryClassName.GaugeTile}><VerticalSpeedIndicator feetPerMinute={fpm} /></div>
        </div>
      </div>

      <DossierCard className="p-3 flex-1 flex flex-col gap-2">
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
