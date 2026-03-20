import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plane,
  Loader2,
  ImageOff,
  Camera,
  Eye,
  Crosshair,
  LocateFixed,
  X,
} from "lucide-react";
import { useData } from "@/context/DataContext";
import { authenticatedFetch } from "@/lib/authService";
import type { DataPoint } from "@/features/base/dataPoints";
import {
  getSquawkStatus,
  getSquawkStatusLabel,
} from "@/features/tracking/aircraft/lib/utils";
import type { AircraftDossier, DossierState } from "./dossierTypes";
import { getCachedDossier, setCachedDossier } from "./dossierTypes";
import {
  IsoBtn,
  Section,
  Row,
  RouteAirport,
  LinkRow,
  formatEpoch,
} from "./DossierAtoms";
import { NonAircraftDossier } from "./NonAircraftDossier";

export function DossierPane() {
  const {
    selectedCurrent,
    setSelected,
    isolateMode,
    setIsolateMode,
    setZoomToId,
  } = useData();

  const [state, setState] = useState<DossierState>({
    status: "idle",
    data: null,
    entityId: null,
  });
  const [photoError, setPhotoError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch dossier ───────────────────────────────────────────────

  const fetchDossier = useCallback(async (item: DataPoint) => {
    if (item.type !== "aircraft") {
      setState({ status: "idle", data: null, entityId: item.id });
      return;
    }
    const { icao24, callsign } = (item as any).data ?? {};
    if (!icao24) {
      setState({ status: "idle", data: null, entityId: item.id });
      return;
    }
    const cacheKey = `${icao24}:${callsign ?? ""}`;
    const cached = await getCachedDossier(cacheKey);
    if (cached) {
      setState({ status: "loaded", data: cached, entityId: item.id });
      setPhotoError(false);
      return;
    }
    setState({ status: "loading", data: null, entityId: item.id });
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
        setState({ status: "error", data: null, entityId: item.id });
        return;
      }
      const { dossier } = (await res.json()) as { dossier: AircraftDossier };
      void setCachedDossier(cacheKey, dossier);
      setState({ status: "loaded", data: dossier, entityId: item.id });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setState({ status: "error", data: null, entityId: item.id });
    }
  }, []);

  useEffect(() => {
    if (!selectedCurrent) {
      setState({ status: "idle", data: null, entityId: null });
      return;
    }
    fetchDossier(selectedCurrent);
  }, [selectedCurrent, fetchDossier]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // ── Isolation handlers ──────────────────────────────────────────

  const handleClose = useCallback(() => {
    setSelected(null);
    setIsolateMode(null);
  }, [setSelected, setIsolateMode]);

  const handleFocus = useCallback(() => {
    const next = isolateMode === "focus" ? null : "focus";
    setIsolateMode(next);
  }, [isolateMode, setIsolateMode]);

  const handleSolo = useCallback(() => {
    const next = isolateMode === "solo" ? null : "solo";
    setIsolateMode(next);
  }, [isolateMode, setIsolateMode]);

  const handleLocate = useCallback(() => {
    if (selectedCurrent) {
      setZoomToId(selectedCurrent.id);
      setTimeout(() => setZoomToId(null), 100);
    }
  }, [setZoomToId, selectedCurrent]);

  // ── Empty state ─────────────────────────────────────────────────

  if (!selectedCurrent) {
    return (
      <div className="h-full flex items-center justify-center text-sig-dim">
        <div className="text-center">
          <Plane className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Select a track to view dossier</p>
        </div>
      </div>
    );
  }

  // ── Non-aircraft types ──────────────────────────────────────────

  if (selectedCurrent.type !== "aircraft") {
    return (
      <NonAircraftDossier
        item={selectedCurrent}
        isolateMode={isolateMode}
        onLocate={handleLocate}
        onFocus={handleFocus}
        onSolo={handleSolo}
        onClose={handleClose}
      />
    );
  }

  // ── Loading / error ─────────────────────────────────────────────

  const acData = (selectedCurrent as any).data ?? {};
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
    speedMps,
    registration: liveReg,
    operator: liveOp,
    operatorIcao,
    model: liveModel,
    manufacturerName: liveMfr,
    acType: liveAcType,
    categoryDescription,
    military: isMilitary,
  } = acData;

  // ── Toolbar (always visible even while loading) ─────────────────

  const toolbar = (
    <div className="p-3 pb-0">
      <div className="flex items-center gap-2">
        <Plane className="w-4 h-4 text-sig-accent shrink-0" />
        <span className="text-sig-bright font-mono tracking-wider text-base truncate flex-1">
          {callsign?.trim() || icao24.toUpperCase()}
        </span>
        {isMilitary && (
          <span
            className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: "#ff664420",
              color: "#ff6644",
              border: "1px solid #ff664460",
            }}
          >
            MIL
          </span>
        )}
        <button
          onClick={handleClose}
          className="p-1.5 rounded text-sig-dim hover:text-sig-bright transition-colors shrink-0"
          title="Deselect"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        <IsoBtn
          active={false}
          label="LOCATE"
          icon={LocateFixed}
          onClick={handleLocate}
        />
        <IsoBtn
          active={isolateMode === "focus"}
          label="FOCUS"
          icon={Eye}
          onClick={handleFocus}
        />
        <IsoBtn
          active={isolateMode === "solo"}
          label="SOLO"
          icon={Crosshair}
          onClick={handleSolo}
        />
      </div>
    </div>
  );

  if (state.status === "loading") {
    return (
      <div className="h-full flex flex-col">
        {toolbar}
        <div className="flex-1 flex items-center justify-center text-sig-dim">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span>Loading dossier...</span>
        </div>
      </div>
    );
  }

  // ── Aircraft dossier ────────────────────────────────────────────

  const dossier = state.data;
  const reg = dossier?.aircraft?.Registration ?? liveReg ?? "";
  const mfr = dossier?.aircraft?.Manufacturer ?? liveMfr ?? "";
  const typeFullName = dossier?.aircraft?.Type ?? "";
  const acTypeShort = liveAcType || (dossier?.aircraft?.ICAOTypeCode ?? "");
  const displayModel = liveModel ?? "";
  const owner =
    dossier?.aircraft?.RegisteredOwners ?? liveOp ?? operatorIcao ?? "";
  const typeCode = dossier?.aircraft?.ICAOTypeCode ?? "";
  const { route, photo } = dossier ?? {};

  const speedMph = Math.round(speed * 1.15078);
  const speedLine =
    typeof speedMps === "number"
      ? `${speed} kn (${speedMph} mph)`
      : `${speed} kn`;

  const squawkLine = squawk
    ? `${squawk} — ${getSquawkStatusLabel(getSquawkStatus(squawk))}`
    : null;

  const vsLine =
    verticalRate != null ? `${Math.round(verticalRate * 196.85)} fpm` : null;

  const category =
    categoryDescription && categoryDescription !== "UNKNOWN"
      ? categoryDescription
      : null;

  return (
    <div className="h-full flex flex-col">
      {toolbar}
      <div className="flex-1 overflow-y-auto sigint-scroll">
        <div className="p-3 space-y-3">
          {/* Photo */}
          {photo && photo.src && !photoError && (
            <a
              href={photo.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded overflow-hidden bg-sig-bg/50 border border-sig-grid hover:border-sig-accent/40 transition-colors"
            >
              <img
                src={photo.src}
                alt={`${reg || icao24}`}
                className="w-full h-auto object-cover max-h-52"
                onError={() => setPhotoError(true)}
                onLoad={(e) => {
                  const el = e.currentTarget as any;
                  if (el.__photoTimeout) clearTimeout(el.__photoTimeout);
                }}
                ref={(el) => {
                  if (!el) return;
                  (el as any).__photoTimeout = setTimeout(() => {
                    if (!el.complete || el.naturalWidth === 0)
                      setPhotoError(true);
                  }, 8000);
                }}
              />
              <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-sig-dim">
                <Camera className="w-3 h-3 shrink-0" />
                <span className="truncate">{photo.photographer}</span>
                <span className="ml-auto shrink-0 text-sig-accent/60">
                  planespotters.net
                </span>
              </div>
            </a>
          )}
          {(photoError || (photo && !photo.src)) && (
            <div className="rounded bg-sig-bg/50 border border-sig-grid flex items-center justify-center h-20 text-sig-dim">
              <ImageOff className="w-4 h-4 mr-2 opacity-40" />
              <span className="text-xs">No photo available</span>
            </div>
          )}

          {/* Identity */}
          <Section title="IDENTITY">
            <Row label="CALLSIGN" value={callsign} />
            <Row label="ICAO24" value={icao24.toUpperCase()} />
            {acTypeShort && <Row label="TYPE" value={acTypeShort} />}
            {typeCode && typeCode !== acTypeShort && (
              <Row label="TYPE CODE" value={typeCode} />
            )}
            {reg && <Row label="REG" value={reg} />}
            {owner && <Row label="OPERATOR" value={owner} />}
            {mfr && <Row label="MANUFACTURER" value={mfr} />}
            {displayModel && <Row label="MODEL" value={displayModel} />}
            {typeFullName && typeFullName !== displayModel && (
              <Row label="AIRCRAFT" value={typeFullName} />
            )}
            {category && <Row label="CATEGORY" value={category} />}
            {originCountry && <Row label="ORIGIN" value={originCountry} />}
          </Section>

          {/* Telemetry */}
          <Section title="TELEMETRY">
            <Row label="ALTITUDE" value={onGround ? "GND" : `${altitude} ft`} />
            <Row label="SPEED" value={speedLine} />
            <Row label="HEADING" value={`${heading}°`} />
            {vsLine && <Row label="V/S" value={vsLine} />}
            <Row label="STATUS" value={onGround ? "ON GROUND" : "AIRBORNE"} />
            {squawkLine && <Row label="SQUAWK" value={squawkLine} />}
          </Section>

          {/* Route */}
          {route && (
            <Section
              title={route.source === "flightaware" ? "ROUTE" : "ROUTE *"}
            >
              <div className="flex items-center gap-2 text-sm text-sig-text">
                <RouteAirport apt={route.origin} />
                <span className="text-sig-dim">→</span>
                <RouteAirport apt={route.destination} />
              </div>
              {route.status && (
                <Row
                  label="STATUS"
                  value={route.status.toUpperCase().replace("_", " ")}
                />
              )}
              {route.origin?.name && (
                <Row
                  label="FROM"
                  value={`${route.origin.name}${route.origin.city ? ` — ${route.origin.city}` : ""}`}
                />
              )}
              {route.origin?.gate && (
                <Row label="GATE" value={route.origin.gate} />
              )}
              {route.destination?.name && (
                <Row
                  label="TO"
                  value={`${route.destination.name}${route.destination.city ? ` — ${route.destination.city}` : ""}`}
                />
              )}
              {route.destination?.gate && (
                <Row label="GATE" value={route.destination.gate} />
              )}
              {route.departureTime && (
                <Row
                  label={route.departureActual ? "DEPARTED" : "DEP (EST)"}
                  value={formatEpoch(route.departureTime)}
                />
              )}
              {route.arrivalTime && (
                <Row
                  label={route.arrivalActual ? "ARRIVED" : "ARR (EST)"}
                  value={formatEpoch(route.arrivalTime)}
                />
              )}
              {route.delays?.departure && (
                <Row label="DEP DELAY" value={route.delays.departure} />
              )}
              {route.delays?.arrival && (
                <Row label="ARR DELAY" value={route.delays.arrival} />
              )}
              {route.airline && <Row label="AIRLINE" value={route.airline} />}
              {route.distance && (
                <Row label="DISTANCE" value={`${route.distance} nm`} />
              )}
              {route.filedAltitude && (
                <Row
                  label="FILED ALT"
                  value={`FL${route.filedAltitude / 100}`}
                />
              )}
              {route.filedSpeed && (
                <Row label="FILED SPD" value={`${route.filedSpeed} kn`} />
              )}
              {route.filedRoute && (
                <div className="mt-1">
                  <span className="text-xs text-sig-dim">FILED ROUTE</span>
                  <div className="text-xs font-mono text-sig-text/70 mt-0.5 break-all leading-relaxed">
                    {route.filedRoute}
                  </div>
                </div>
              )}
              {route.source === "hexdb" && (
                <div className="text-xs text-sig-dim/60 mt-1">
                  * Last known route — may not reflect current flight
                </div>
              )}
            </Section>
          )}

          {/* Position */}
          <Section title="POSITION">
            <div className="text-sm font-mono text-sig-dim">
              {Math.abs(selectedCurrent.lat).toFixed(3)}°
              {selectedCurrent.lat >= 0 ? "N" : "S"},{" "}
              {Math.abs(selectedCurrent.lon).toFixed(3)}°
              {selectedCurrent.lon >= 0 ? "E" : "W"}
            </div>
          </Section>

          {/* Intel links */}
          <Section title="INTEL LINKS">
            {callsign?.trim() && (
              <>
                <LinkRow
                  label="FlightAware"
                  href={`https://flightaware.com/live/flight/${callsign.trim()}`}
                />
                <LinkRow
                  label="FlightRadar24"
                  href={`https://www.flightradar24.com/${callsign.trim()}`}
                />
              </>
            )}
            <LinkRow
              label="ADS-B Exchange"
              href={`https://globe.adsbexchange.com/?icao=${icao24}`}
            />
            <LinkRow
              label="Planespotters"
              href={`https://www.planespotters.net/hex/${icao24.toUpperCase()}`}
            />
            {reg && (
              <LinkRow
                label="JetPhotos"
                href={`https://www.jetphotos.com/registration/${reg}`}
              />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
