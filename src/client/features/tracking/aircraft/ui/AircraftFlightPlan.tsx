import { Fragment } from "react";
import { ArrowRight, Navigation } from "lucide-react";
import {
  AIRCRAFT_MINIMUM_LATE_SECONDS,
  AircraftEventTime,
  AircraftFlightEvent,
  AircraftRouteSource,
  aircraftAirportCode,
  eventDelaySeconds,
  nextRouteFix,
  observedEventTime,
  type AircraftEventTimes,
  type AircraftRoute,
  type AircraftRouteEndpoint,
  type AircraftRouteFix,
} from "@shared/domain/aircraftDossier";
import { GeoMeasurement, haversineKm } from "@shared/geo";
import { MINUTES_PER_HOUR, SECONDS_PER_MINUTE } from "@shared/time";
import { EMPTY_TEXT, NO_VALUE } from "@shared/text";
import {
  DossierCard,
  DossierInfoRow,
  DossierLabel,
  DossierSectionLabel,
} from "@/dossier";
import { formatKtShort, formatNauticalMiles, kmToNm } from "@/measurements";
import { DossierFallback } from "@/panes/dossier/dossierFallback";
import { formatClockTime, formatDuration, localZoneName } from "@/time";
import { AircraftChipTone, type AircraftChip } from "./AircraftIdentityTicket";

enum AircraftDelayMinutes {
  WarningMaximum = 15,
  LateMaximum = 60,
}

enum AircraftFlightPlanLabel {
  Arrive = "ARRIVE",
  Depart = "DEPART",
  Estimated = " est",
  OnTime = "ON TIME",
}

enum AircraftFlightPlanClassName {
  Block = "font-mono text-(length:--sig-text-xs) mt-3 pt-2 border-t border-sig-border/50",
  RowLabel = "text-sig-dim",
  Chip = "rounded border px-1.5 py-0.5",
}

const SECONDS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;

const EVENT_LABELS: Readonly<Record<AircraftFlightEvent, string>> = {
  [AircraftFlightEvent.GateOut]: "GATE OUT",
  [AircraftFlightEvent.Takeoff]: "TAKEOFF",
  [AircraftFlightEvent.Landing]: "LANDING",
  [AircraftFlightEvent.GateIn]: "GATE IN",
};

function delayTone(minutes: number): AircraftChipTone {
  if (minutes <= AircraftDelayMinutes.WarningMaximum) return AircraftChipTone.Warning;
  return minutes <= AircraftDelayMinutes.LateMaximum
    ? AircraftChipTone.Late
    : AircraftChipTone.Critical;
}

export function delayChip(delaySeconds: number | undefined): AircraftChip {
  if (delaySeconds === undefined || delaySeconds <= AIRCRAFT_MINIMUM_LATE_SECONDS) {
    return { label: AircraftFlightPlanLabel.OnTime, tone: AircraftChipTone.OnTime };
  }
  return {
    label: `+${formatDuration(delaySeconds)}`,
    tone: delayTone(delaySeconds / SECONDS_PER_MINUTE),
  };
}

function RouteEndpoint({
  endpoint,
  label,
  alignEnd,
}: Readonly<{ endpoint: AircraftRouteEndpoint; label: string; alignEnd?: boolean }>) {
  return (
    <div className={`min-w-0 ${alignEnd ? "text-right" : EMPTY_TEXT}`}>
      <DossierLabel>{endpoint.gate ? `${label} · GATE ${endpoint.gate}` : label}</DossierLabel>
      <div className="text-(length:--sig-text-lg) font-bold font-mono text-sig-bright">
        {aircraftAirportCode(endpoint) || NO_VALUE}
      </div>
      <div className="text-(length:--sig-text-xs) text-sig-text truncate">
        {endpoint.name || endpoint.city || DossierFallback.Unavailable}
      </div>
    </div>
  );
}

function observedText(times: AircraftEventTimes | undefined): string {
  const observed = observedEventTime(times);
  if (observed === undefined) return NO_VALUE;
  const firm = times?.[AircraftEventTime.Actual] !== undefined;
  return `${formatClockTime(observed, false)}${firm ? EMPTY_TEXT : AircraftFlightPlanLabel.Estimated}`;
}

function TimetableRow({
  event,
  times,
}: Readonly<{ event: AircraftFlightEvent; times: AircraftEventTimes }>) {
  const scheduled = times[AircraftEventTime.Scheduled];
  const delay = eventDelaySeconds(times);
  const chip = delay === undefined ? null : delayChip(delay);
  return (
    <>
      <span className={AircraftFlightPlanClassName.RowLabel}>{EVENT_LABELS[event]}</span>
      <span>{scheduled === undefined ? NO_VALUE : formatClockTime(scheduled, false)}</span>
      <span className="text-sig-bright">{observedText(times)}</span>
      <span className={chip ? `${AircraftFlightPlanClassName.Chip} text-center ${chip.tone}` : EMPTY_TEXT}>
        {chip?.label}
      </span>
    </>
  );
}

function Timetable({ route }: Readonly<{ route: AircraftRoute }>) {
  const rows = Object.values(AircraftFlightEvent).flatMap((event) => {
    const times = route.schedule?.[event];
    return times && Object.keys(times).length > 0 ? [{ event, times }] : [];
  });
  if (rows.length === 0) return null;
  return (
    <div className={`grid grid-cols-[auto_1fr_1fr_auto] gap-x-3 gap-y-1 items-center text-sig-text ${AircraftFlightPlanClassName.Block}`}>
      <span className={AircraftFlightPlanClassName.RowLabel}>{localZoneName()}</span>
      <DossierLabel>SCHED</DossierLabel>
      <DossierLabel>ACTUAL</DossierLabel>
      <span />
      {rows.map(({ event, times }) => (
        <TimetableRow key={event} event={event} times={times} />
      ))}
    </div>
  );
}

function taxiOutSeconds(route: AircraftRoute): number | undefined {
  const gateOut = observedEventTime(route.schedule?.[AircraftFlightEvent.GateOut]);
  const takeoff = observedEventTime(route.schedule?.[AircraftFlightEvent.Takeoff]);
  return gateOut === undefined || takeoff === undefined || takeoff <= gateOut
    ? undefined
    : takeoff - gateOut;
}

type FlightPlanRow = readonly [label: string, value: string | null];

function flightPlanRows(route: AircraftRoute): FlightPlanRow[] {
  const taxi = taxiOutSeconds(route);
  return [
    ["DISTANCE", route.distance == null ? null : formatNauticalMiles(route.distance)],
    ["FILED ALT", route.filedAltitude == null ? null : `FL${route.filedAltitude / GeoMeasurement.FeetPerFlightLevel}`],
    ["FILED SPEED", route.filedSpeed == null ? null : formatKtShort(route.filedSpeed)],
    ["TIME EN ROUTE", route.ete == null ? null : formatDuration(route.ete)],
    ["TAXI OUT", taxi === undefined ? null : formatDuration(taxi)],
  ];
}

function FlightPlanStats({ route }: Readonly<{ route: AircraftRoute }>) {
  const rows = flightPlanRows(route).filter(([, value]) => value !== null);
  if (rows.length === 0) return null;
  return (
    <div className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 items-baseline ${AircraftFlightPlanClassName.Block}`}>
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <span className={AircraftFlightPlanClassName.RowLabel}>{label}</span>
          <span className="text-sig-bright text-right">{value}</span>
        </Fragment>
      ))}
    </div>
  );
}

function FiledRoute({ filedRoute }: Readonly<{ filedRoute: string }>) {
  return (
    <div className={AircraftFlightPlanClassName.Block}>
      <DossierLabel className="mb-1.5">FILED ROUTE</DossierLabel>
      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto sigint-scroll">
        {filedRoute
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((waypoint, index) => (
            <span
              key={`${waypoint}-${index}`}
              className={`${AircraftFlightPlanClassName.Chip} text-sig-text bg-sig-bg/60 border-sig-border`}
            >
              {waypoint}
            </span>
          ))}
      </div>
    </div>
  );
}

export function AircraftFlightPlan({ route }: Readonly<{ route: AircraftRoute }>) {
  return (
    <section className="sec flightplan min-w-0 flex flex-col">
      <DossierSectionLabel>FLIGHT PLAN</DossierSectionLabel>
      <DossierCard className="p-3 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 items-center">
          <RouteEndpoint endpoint={route.origin} label={AircraftFlightPlanLabel.Depart} />
          <ArrowRight className="w-4 h-4 text-sig-dim" aria-hidden={true} />
          <RouteEndpoint endpoint={route.destination} label={AircraftFlightPlanLabel.Arrive} alignEnd />
        </div>
        <Timetable route={route} />
        <FlightPlanStats route={route} />
        {route.filedRoute && <FiledRoute filedRoute={route.filedRoute} />}
      </DossierCard>
      {route.source === AircraftRouteSource.HexDb && (
        <div className="text-(length:--sig-text-xs) text-sig-dim/60 mt-1">
          * Last known route; may not reflect current flight
        </div>
      )}
    </section>
  );
}

type RouteNextFixProps = Readonly<{
  className?: string;
  fixes: readonly AircraftRouteFix[] | undefined;
  groundSpeed: number;
  latitude: number;
  longitude: number;
}>;

export function RouteNextFix({ className, fixes, groundSpeed, latitude, longitude }: RouteNextFixProps) {
  const fix = fixes ? nextRouteFix(fixes, latitude, longitude) : undefined;
  if (!fix) return null;
  const distance = kmToNm(haversineKm(latitude, longitude, fix.point[0], fix.point[1]));
  const time = groundSpeed > 0 ? formatDuration((distance / groundSpeed) * SECONDS_PER_HOUR) : null;
  return (
    <DossierInfoRow
      className={className}
      icon={Navigation}
      label="NEXT FIX"
      value={[fix.name, formatNauticalMiles(distance), time].filter(Boolean).join(" · ")}
    />
  );
}
