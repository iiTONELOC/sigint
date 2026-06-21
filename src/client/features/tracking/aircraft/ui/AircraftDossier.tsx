import { useState, useEffect, useRef, useCallback } from "react";
import { Plane, ExternalLink, LocateFixed } from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import { authenticatedFetch } from "@/lib/authService";
import { getTrail } from "@/lib/trailService";
import { useAircraftPhoto } from "../hooks/useAircraftPhoto";
import { AircraftRouteMap } from "./AircraftRouteMap";
import { RouteProgress } from "./RouteProgress";
import { AircraftIdentityTicket } from "./AircraftIdentityTicket";
import { AircraftTelemetryPFD } from "./AircraftTelemetryPFD";
import { SectionLabel, Card, StatCell, Label, RouteEndpoint } from "./dossierKit";
import { ktToMph, machFromGs, isaTempC } from "@/lib/units";
import {
  getSquawkStatus,
  delaySeverity,
  sourceLabel,
  windComponents,
} from "@/features/tracking/aircraft/lib/utils";
import type {
  AircraftDossier as AircraftDossierData,
  DossierState,
} from "@/panes/dossier/dossierTypes";
import {
  getCachedDossier,
  setCachedDossier,
  airportCode,
} from "@/panes/dossier/dossierTypes";
import {
  DossierToolbar,
  formatEpoch,
  useDossierFocus,
} from "@/panes/dossier/DossierAtoms";

type Props = {
  readonly item: DataPoint;
  readonly isolateMode: null | "solo" | "focus";
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

type Chip = { readonly label: string; readonly tone: string };

function onTimeChip(hasRoute: boolean, delay?: string): Chip | null {
  if (!hasRoute) return null;
  if (!delay) return { label: "ON TIME", tone: "sig-quakes" };
  const m = /(-?\d+)/.exec(delay);
  const mins = m ? Number(m[1]) : 0;
  return { label: mins <= 0 ? "ON TIME" : `+${mins}m`, tone: delaySeverity(mins) };
}

export function AircraftDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const [state, setState] = useState<DossierState>({
    status: "idle",
    data: null,
    entityId: null,
  });
  const [photoError, setPhotoError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const closeBtnRef = useDossierFocus(item.id);

  const fetchDossier = useCallback(async (entity: DataPoint) => {
    const { icao24, callsign } = (entity as any).data ?? {};
    if (!icao24) {
      setState({ status: "idle", data: null, entityId: entity.id });
      return;
    }
    const cacheKey = `${icao24}:${callsign ?? ""}`;
    const cached = await getCachedDossier(cacheKey);
    if (cached) {
      setState({ status: "loaded", data: cached, entityId: entity.id });
      setPhotoError(false);
      return;
    }
    setState({ status: "loading", data: null, entityId: entity.id });
    setPhotoError(false);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const cs = callsign?.trim();
      const qs = cs ? `?callsign=${encodeURIComponent(cs)}` : "";
      const res = await authenticatedFetch(
        `/api/dossier/aircraft/${icao24.toLowerCase()}${qs}`,
        { signal: controller.signal },
      );
      if (!res.ok) {
        setState({ status: "error", data: null, entityId: entity.id });
        return;
      }
      const { dossier } = (await res.json()) as { dossier: AircraftDossierData };
      void setCachedDossier(cacheKey, dossier);
      setState({ status: "loaded", data: dossier, entityId: entity.id });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setState({ status: "error", data: null, entityId: entity.id });
    }
  }, []);

  useEffect(() => {
    fetchDossier(item);
  }, [item, fetchDossier]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const acData = (item as any).data ?? {};
  const {
    callsign = "",
    icao24 = "",
    altitude = 0,
    speed = 0,
    heading = 0,
    squawk,
    onGround,
    originCountry = "",
    verticalRate,
    registration: liveReg,
    operator: liveOp,
    operatorIcao,
    model: liveModel,
    manufacturerName: liveMfr,
    acType: liveAcType,
    categoryDescription,
    military: isMilitary,
    recon: isRecon,
    mach,
    tas,
    windDir,
    windSpd,
    oat,
    tat,
    navQnh,
    navModes,
    navHeading,
    navAltitudeMcp,
    navAltitudeFms,
    rssi,
    nacP,
    adsbType,
  } = acData;

  const { photo, loading: photoLoading } = useAircraftPhoto(icao24, liveReg || undefined);

  const title = callsign?.trim() || icao24.toUpperCase();
  const toolbar = (
    <DossierToolbar
      icon={Plane}
      title={title}
      badge={isRecon ? "RECON" : isMilitary ? "MIL" : null}
      isolateMode={isolateMode}
      onLocate={onLocate}
      onFocus={onFocus}
      onSolo={onSolo}
      onClose={onClose}
      closeButtonRef={closeBtnRef}
    />
  );

  const dossier = state.data;
  const reg = dossier?.aircraft?.Registration ?? liveReg ?? "";
  const mfr = dossier?.aircraft?.Manufacturer ?? liveMfr ?? "";
  const typeFullName = dossier?.aircraft?.Type ?? "";
  const acTypeShort = liveAcType || (dossier?.aircraft?.ICAOTypeCode ?? "");
  const displayModel = liveModel ?? "";
  const modelFamily = displayModel.split(/[\s/-]/)[0] ?? "";
  const typeBadge = modelFamily.length >= 3 ? modelFamily : acTypeShort;
  const owner =
    dossier?.aircraft?.RegisteredOwners ?? liveOp ?? operatorIcao ?? "";
  const { route } = dossier ?? {};

  const speedFooter = `${ktToMph(speed)} mph`;
  const fpm = verticalRate != null ? Math.round(verticalRate * 196.85) : 0;
  const emergency = squawk ? getSquawkStatus(squawk) !== "normal" : false;
  const wake =
    categoryDescription && categoryDescription !== "UNKNOWN"
      ? categoryDescription
      : null;
  const selectedAlt = navAltitudeMcp ?? navAltitudeFms;

  const machVal = typeof mach === "number" ? mach : machFromGs(speed, altitude);
  const machText = `${typeof mach === "number" ? "" : "~"}M ${machVal.toFixed(2)}`;
  const tasText = `${Math.round(typeof tas === "number" ? tas : speed)} kt`;

  const isaDev = typeof oat === "number" ? Math.round(oat - isaTempC(altitude)) : null;
  const isaText = isaDev != null ? `ISA ${isaDev >= 0 ? "+" : ""}${isaDev}` : null;
  const tatText = typeof tat === "number" ? `${Math.round(tat)}°C` : null;
  const wc = windComponents(windDir, windSpd, heading);
  const windCompText = wc
    ? `${wc.head >= 0 ? `H${wc.head}` : `T${Math.abs(wc.head)}`} · X${wc.cross}${wc.side}`
    : null;
  const rssiText = typeof rssi === "number" ? `${Math.round(rssi)} dB` : null;
  const accText = typeof nacP === "number" ? `${nacP}` : null;
  const sourceText = sourceLabel(adsbType);

  const trail = [
    ...getTrail(item.id),
    { lat: item.lat, lon: item.lon, altitude, heading, speed, ts: Date.now() },
  ];

  const originCode = airportCode(route?.origin);
  const destCode = airportCode(route?.destination);
  const chip = onTimeChip(!!route, route?.delays?.departure);
  const arrLate = !!chip && chip.label !== "ON TIME";

  const links: ReadonlyArray<readonly [string, string]> = [
    ...(callsign?.trim()
      ? ([
          ["FlightAware", `https://flightaware.com/live/flight/${callsign.trim()}`],
          ["FlightRadar24", `https://www.flightradar24.com/${callsign.trim()}`],
        ] as const)
      : []),
    ["ADS-B Exchange", `https://globe.adsbexchange.com/?icao=${icao24}`],
    ["Planespotters", `https://www.planespotters.net/hex/${icao24.toUpperCase()}`],
    ...(reg
      ? ([["JetPhotos", `https://www.jetphotos.com/registration/${reg}`]] as const)
      : []),
  ];

  const coords = (
    <div className="flex items-center justify-between bg-sig-panel border border-sig-border rounded-[10px] px-3 py-1.5">
      <span className="flex items-center gap-1.5 text-(length:--sig-text-xs) text-sig-text">
        <LocateFixed className="w-3.5 h-3.5 text-(--dossier-accent)" aria-hidden="true" />
        POSITION
      </span>
      <span className="text-(length:--sig-text-xs) text-sig-bright font-mono">
        {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"} ·{" "}
        {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
      </span>
    </div>
  );

  return (
    <div className="@container/dossier h-full flex flex-col">
      {toolbar}
      <div className="flex-1 min-h-0 overflow-auto sigint-scroll p-3 flex flex-col gap-3">
      <div className="grid grid-cols-1 @min-[40rem]/dossier:grid-cols-2 @min-[76rem]/dossier:grid-cols-4 gap-2 items-start @min-[40rem]/dossier:items-stretch">
        <section className="sec identity min-w-0">
          <AircraftIdentityTicket
            photo={photo}
            photoLoading={photoLoading}
            photoError={photoError}
            onPhotoError={() => setPhotoError(true)}
            typeBadge={typeBadge}
            military={!!isMilitary}
            recon={!!isRecon}
            operator={owner}
            chip={chip}
            reg={reg}
            icao24={icao24}
            originCountry={originCountry}
            model={displayModel}
            aircraft={typeFullName}
            mfr={mfr}
            wake={wake}
          />
        </section>

        {route && (
          <section className="sec flightplan min-w-0 flex flex-col">
            <SectionLabel>FLIGHT PLAN</SectionLabel>
            <div className="flex flex-col gap-2">
              <RouteEndpoint
                label="DEPART"
                gate={route.origin?.gate}
                name={route.origin?.name || route.origin?.city || originCode || "—"}
                time={route.departureTime ? formatEpoch(route.departureTime) : undefined}
                actual={route.departureActual}
              />
              <RouteEndpoint
                label="ARRIVE"
                gate={route.destination?.gate}
                name={route.destination?.name || route.destination?.city || destCode || "—"}
                time={route.arrivalTime ? formatEpoch(route.arrivalTime) : undefined}
                actual={route.arrivalActual}
                late={arrLate}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {route.distance != null && <StatCell label="DIST nm" value={String(route.distance)} />}
              {route.filedAltitude != null && (
                <StatCell label="FILED ALT" value={`FL${route.filedAltitude / 100}`} />
              )}
              {route.filedSpeed != null && <StatCell label="FILED kn" value={String(route.filedSpeed)} />}
            </div>
            {route.filedRoute && (
              <Card className="p-2.5 mt-2">
                <Label className="mb-1.5">FILED ROUTE</Label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto sigint-scroll">
                  {route.filedRoute
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean)
                    .map((wp, i) => (
                      <span
                        key={`${wp}-${i}`}
                        className="text-(length:--sig-text-xs) font-mono text-sig-text bg-sig-bg/60 border border-sig-border rounded px-1.5 py-0.5"
                      >
                        {wp}
                      </span>
                    ))}
                </div>
              </Card>
            )}
            {route.source === "hexdb" && (
              <div className="text-(length:--sig-text-xs) text-sig-dim/60 mt-1">
                * Last known route — may not reflect current flight
              </div>
            )}
          </section>
        )}

        <section className="sec route min-w-0 flex flex-col">
          <SectionLabel>ROUTE</SectionLabel>
          <div className="h-52 @min-[40rem]/dossier:h-auto @min-[40rem]/dossier:flex-1 @min-[40rem]/dossier:min-h-0">
            <AircraftRouteMap
              originCode={originCode}
              destCode={destCode}
              lat={item.lat}
              lon={item.lon}
              heading={heading}
              waypoints={route?.waypoints}
              trail={trail}
              hud={{
                mach: machText,
                tas: tasText,
                heading: `${Math.round(heading)}°`,
                eta: route?.arrivalTime ? formatEpoch(route.arrivalTime) : undefined,
              }}
            />
          </div>
          <div className="mt-2">{coords}</div>
          {route && (
            <div className="mt-2">
              <RouteProgress
                origin={originCode}
                dest={destCode}
                departureTime={route.departureTime}
                arrivalTime={route.arrivalTime}
              />
            </div>
          )}
        </section>

        <section className="sec telemetry min-w-0 flex flex-col">
          <SectionLabel>LIVE TELEMETRY</SectionLabel>
          <AircraftTelemetryPFD
            speed={speed}
            speedFooter={speedFooter}
            heading={heading}
            selectedHeading={navHeading}
            altitude={altitude}
            selectedAlt={selectedAlt}
            onGround={onGround}
            fpm={fpm}
            squawk={squawk}
            emergency={emergency}
            windDir={windDir}
            windSpd={windSpd}
            oat={oat}
            navQnh={navQnh}
            navModes={navModes}
            windCompText={windCompText}
            isaText={isaText}
            tatText={tatText}
            rssiText={rssiText}
            accText={accText}
            sourceText={sourceText}
          />
        </section>
      </div>

      <section className="intel">
        <SectionLabel>INTEL LINKS</SectionLabel>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
          {links.map(([label, href]) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 bg-sig-panel border border-sig-border rounded-lg px-2.5 py-2 text-(length:--sig-text-sm) text-sig-accent hover:border-sig-accent/40 transition-colors"
            >
              <span className="truncate">{label}</span>
              <ExternalLink className="w-3 h-3 shrink-0 text-sig-dim" aria-hidden="true" />
            </a>
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}
