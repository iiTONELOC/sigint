import { PanelSide } from "@/workers/render/protocol";
import { DetailField, DetailFieldAlign } from "@/dossier";
import { Tape } from "./instruments/Tape";
import { HeadingHSI } from "./instruments/HeadingHSI";
import { VerticalSpeed } from "./instruments/VerticalSpeed";
import { isaTempC } from "../utils";
import { AircraftFlightStatusLabel } from "../types";
import { Card } from "./dossierKit";
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

type TelemetryStat = Readonly<{
  label: AircraftTelemetryLabel;
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

type Props = {
  readonly speed: number;
  readonly speedFooter: string;
  readonly heading: number;
  readonly selectedHeading?: number;
  readonly altitude: number;
  readonly selectedAlt?: number;
  readonly onGround?: boolean;
  readonly fpm: number;
  readonly squawk?: string;
  readonly emergency: boolean;
  readonly windDir?: number;
  readonly windSpd?: number;
  readonly oat?: number;
  readonly navQnh?: number;
  readonly navModes?: readonly string[];
  readonly windCompText?: string | null;
  readonly isaText?: string | null;
  readonly tatText?: string | null;
  readonly rssiText?: string | null;
  readonly accText?: string | null;
  readonly sourceText?: string | null;
  readonly driftText?: string | null;
};

function windText(
  direction: number | undefined,
  speed: number | undefined,
): string | null {
  if (direction == null || speed == null) return null;
  return `${Math.round(direction)}° / ${Math.round(speed)} kt`;
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

function appendTelemetryStat(
  stats: TelemetryStat[],
  label: AircraftTelemetryLabel,
  value: string | null | undefined,
): void {
  if (value) stats.push({ label, value });
}

function buildTelemetryStats(props: Props): TelemetryStat[] {
  const stats: TelemetryStat[] = [];
  appendTelemetryStat(
    stats,
    AircraftTelemetryLabel.Wind,
    windText(props.windDir, props.windSpd),
  );
  appendTelemetryStat(
    stats,
    AircraftTelemetryLabel.WindComponent,
    props.windCompText,
  );
  appendTelemetryStat(
    stats,
    AircraftTelemetryLabel.Drift,
    props.driftText,
  );
  appendTelemetryStat(
    stats,
    AircraftTelemetryLabel.OutsideAirTemperature,
    outsideAirTemperatureText(props.oat, props.altitude),
  );
  appendTelemetryStat(
    stats,
    AircraftTelemetryLabel.IsaDeviation,
    props.isaText,
  );
  appendTelemetryStat(
    stats,
    AircraftTelemetryLabel.TotalAirTemperature,
    props.tatText,
  );
  appendTelemetryStat(
    stats,
    AircraftTelemetryLabel.Pressure,
    props.navQnh != null ? `${Math.round(props.navQnh)} hPa` : null,
  );
  appendTelemetryStat(
    stats,
    AircraftTelemetryLabel.Autopilot,
    autopilotText(props.navModes),
  );
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

export function AircraftTelemetryPFD(props: Props) {
  const {
    speed,
    speedFooter,
    heading,
    selectedHeading,
    altitude,
    selectedAlt,
    onGround,
    fpm,
    squawk,
    emergency,
    rssiText,
    accText,
    sourceText,
  } = props;
  const statRows = telemetryRows(buildTelemetryStats(props));

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
            footer={speedFooter}
            format={String}
          />
        </div>
        <div className="relative flex-1 min-w-28">
          <HeadingHSI heading={heading} selectedHeading={selectedHeading} />
          <Corner
            pos={AircraftTelemetryCornerPosition.Source}
            label={AircraftTelemetryLabel.Source}
            value={sourceText}
          />
          <Corner
            pos={AircraftTelemetryCornerPosition.Signal}
            label={AircraftTelemetryLabel.Signal}
            value={rssiText}
          />
          <Corner
            pos={AircraftTelemetryCornerPosition.Accuracy}
            label={AircraftTelemetryLabel.Accuracy}
            value={accText}
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
            selected={selectedAlt}
            format={(value) => (
              value / AircraftTelemetryValue.AltitudeFooterDivisor
            ).toFixed(AircraftTelemetryPrecision.AltitudeThousands)}
          />
        </div>
        <div className={AircraftTelemetryClassName.SideTape}>
          <VerticalSpeed fpm={fpm} />
        </div>
      </div>

      <Card className="p-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <DetailField
            label={AircraftTelemetryLabel.State}
            value={
              onGround
                ? AircraftFlightStatusLabel.OnGround
                : AircraftFlightStatusLabel.Airborne
            }
          />
          {squawk && (
            <DetailField
              label={AircraftTelemetryLabel.Squawk}
              value={squawk}
              align={DetailFieldAlign.Right}
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
                    align={DetailFieldAlign.Right}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
