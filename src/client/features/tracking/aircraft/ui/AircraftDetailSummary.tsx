import type { DataPoint } from "@/features/base/dataPoints";
import { Field } from "./dossierKit";
import { getSquawkStatus } from "../lib/utils";

function vsClass(fpm: number): string {
  if (fpm <= -2000) return "text-sig-danger";
  if (fpm < -50) return "text-sig-accent";
  if (fpm > 50) return "text-sig-quakes";
  return "";
}

export function AircraftDetailSummary({ item }: { readonly item: DataPoint }) {
  const d = (item as { data?: Record<string, any> }).data ?? {};

  const operator = d.operator || d.operatorIcao || d.registration || "Unknown";
  const callsign = (d.callsign ?? "").trim();
  const reg = d.registration ?? "";
  const sub = [callsign, reg].filter(Boolean).join(" · ");

  const model = d.model ?? "";
  const family = model.split(/[\s/-]/)[0] ?? "";
  const typeBadge = family.length >= 3 ? family : d.acType || "";

  const emergency = d.squawk ? getSquawkStatus(d.squawk) !== "normal" : false;
  const fpm = d.verticalRate != null ? Math.round(d.verticalRate * 196.85) : 0;
  const alt = d.altitude != null ? Math.round(d.altitude).toLocaleString() : "—";
  const spd = d.speed != null ? `${Math.round(d.speed)}` : "—";
  const hdg = d.heading != null ? `${Math.round(d.heading)}°` : "—";
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
            <span className="text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-danger/10 text-sig-danger border border-sig-danger/40">
              {d.squawk} EMERG
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-sig-border/50">
        <div className="flex justify-between gap-4">
          <Field label="ALT ft" value={alt} />
          <Field label="GS kn" value={spd} align="right" />
        </div>
        <div className="flex justify-between gap-4">
          <Field label="HDG" value={hdg} />
          <Field label="V/S fpm" value={vs} align="right" valueClass={vsClass(fpm)} />
        </div>
        <div className="flex justify-between gap-4">
          <Field label="STATUS" value={d.onGround ? "ON GROUND" : "AIRBORNE"} />
          {d.squawk && (
            <Field
              label="SQUAWK"
              value={d.squawk}
              align="right"
              valueClass={emergency ? "text-sig-danger" : ""}
            />
          )}
        </div>
      </div>
    </div>
  );
}
