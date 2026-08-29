import type { DataPoint } from "@/features/base/dataPoints";
import { DetailField } from "@/dossier";
import { PanelSide } from "@/layout-mode/model/layoutMode";
import type { AircraftData } from "@shared/domain/aircraft";
import {
  aircraftBadgePresentation,
  aircraftEmergencyPresentation,
  AircraftFlightStatusLabel,
  aircraftVerticalSpeedFpm,
} from "../formatters/presentation";
import { EMPTY_TEXT, NO_VALUE } from "@shared/text";

enum AircraftSummaryValue {
  CriticalDescentFeetPerMinute = -2_000,
  DescentFeetPerMinute = -50,
  ClimbFeetPerMinute = 50,
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
  const badge = aircraftBadgePresentation(d);
  const emergency = aircraftEmergencyPresentation(d);
  const fpm = aircraftVerticalSpeedFpm(d.verticalRate);
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
            {badge.operator}
          </div>
          {badge.subtitle && <div className="text-(length:--sig-text-xs) text-sig-dim mt-0.5 truncate">{badge.subtitle}</div>}
        </div>
        {badge.typeBadge && (
          <span className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 text-sig-aircraft border border-sig-aircraft/40">
            {badge.typeBadge}
          </span>
        )}
      </div>

      {(d.recon || d.military || emergency.active) && (
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
          {emergency.active && (
            <span
              className={`text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-danger/10 border border-sig-danger/40 ${AircraftSummaryClassName.DangerText}`}
            >
              {emergency.label}
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
            align={PanelSide.Right}
          />
        </div>
        <div className="flex justify-between gap-4">
          <DetailField label="HDG" value={hdg} />
          <DetailField
            label="V/S fpm"
            value={vs}
            align={PanelSide.Right}
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
              align={PanelSide.Right}
              valueClass={
                emergency.active
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
