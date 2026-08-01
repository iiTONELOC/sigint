import type { DataPoint } from "@/features/base/dataPoints";
import { DetailField, DetailFieldAlign } from "@/dossier";
import { metersPerSecondToFeetPerMinute } from "@/measurements";
import {
  AircraftDataLabel,
  AircraftFlightStatusLabel,
  type AircraftData,
} from "../types";
import { getSquawkStatus } from "../lib/utils";
import { SquawkStatus } from "@shared/domain/aircraft";
import { EMPTY_TEXT, NO_VALUE } from "@shared/text";

enum AircraftSummaryValue {
  CriticalDescentFeetPerMinute = -2_000,
  DescentFeetPerMinute = -50,
  ClimbFeetPerMinute = 50,
  ModelFamilyMinimumLength = 3,
}

enum AircraftSummaryClassName {
  AccentText = "text-sig-accent",
  DangerText = "text-sig-danger",
  QuakeText = "text-sig-quakes",
}

function vsClass(fpm: number): string {
  if (fpm <= AircraftSummaryValue.CriticalDescentFeetPerMinute) {
    return AircraftSummaryClassName.DangerText;
  }
  if (fpm < AircraftSummaryValue.DescentFeetPerMinute) {
    return AircraftSummaryClassName.AccentText;
  }
  if (fpm > AircraftSummaryValue.ClimbFeetPerMinute) {
    return AircraftSummaryClassName.QuakeText;
  }
  return EMPTY_TEXT;
}

export function AircraftDetailSummary({ item }: { readonly item: DataPoint }) {
  const d = item.data as AircraftData;

  const operator =
    d.operator ||
    d.operatorIcao ||
    d.registration ||
    AircraftDataLabel.Unknown;
  const callsign = (d.callsign ?? EMPTY_TEXT).trim();
  const reg = d.registration ?? EMPTY_TEXT;
  const sub = [callsign, reg].filter(Boolean).join(" · ");

  const model = d.model ?? EMPTY_TEXT;
  const family = model.split(/[\s/-]/)[0] ?? EMPTY_TEXT;
  const typeBadge =
    family.length >= AircraftSummaryValue.ModelFamilyMinimumLength
      ? family
      : d.acType || EMPTY_TEXT;

  const emergency = d.squawk
    ? getSquawkStatus(d.squawk) !== SquawkStatus.Normal
    : false;
  const fpm = d.verticalRate != null
    ? Math.round(metersPerSecondToFeetPerMinute(d.verticalRate))
    : 0;
  const alt = d.altitude != null
    ? Math.round(d.altitude).toLocaleString()
    : NO_VALUE;
  const spd = d.speed != null ? `${Math.round(d.speed)}` : NO_VALUE;
  const hdg = d.heading != null ? `${Math.round(d.heading)}°` : NO_VALUE;
  const vs = `${fpm > 0 ? "+" : ""}${fpm.toLocaleString()}`;

  return (
    <div className="pt-2.5 border-t border-sig-border">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-(length:--sig-text-lg) font-bold text-sig-bright truncate">
            {operator}
          </div>
          {sub && <div className="text-(length:--sig-text-xs) text-sig-dim mt-0.5 truncate">{sub}</div>}
        </div>
        {typeBadge && (
          <span className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 text-sig-aircraft border border-sig-aircraft/40">
            {typeBadge}
          </span>
        )}
      </div>

      {(d.recon || d.military || emergency) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {d.recon && (
            <span className="text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 text-sig-recon border border-sig-recon/40">
              RECON
            </span>
          )}
          {d.military && (
            <span className="text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 text-sig-bright border border-sig-bright/40">
              MIL
            </span>
          )}
          {emergency && (
            <span
              className={`text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-danger/10 border border-sig-danger/40 ${AircraftSummaryClassName.DangerText}`}
            >
              {d.squawk} EMERG
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50">
        <div className="flex justify-between gap-4">
          <DetailField label="ALT ft" value={alt} />
          <DetailField
            label="GS kn"
            value={spd}
            align={DetailFieldAlign.Right}
          />
        </div>
        <div className="flex justify-between gap-4">
          <DetailField label="HDG" value={hdg} />
          <DetailField
            label="V/S fpm"
            value={vs}
            align={DetailFieldAlign.Right}
            valueClass={vsClass(fpm)}
          />
        </div>
        <div className="flex justify-between gap-4">
          <DetailField
            label="STATUS"
            value={
              d.onGround
                ? AircraftFlightStatusLabel.OnGround
                : AircraftFlightStatusLabel.Airborne
            }
          />
          {d.squawk && (
            <DetailField
              label="SQUAWK"
              value={d.squawk}
              align={DetailFieldAlign.Right}
              valueClass={
                emergency
                  ? AircraftSummaryClassName.DangerText
                  : EMPTY_TEXT
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
