import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plane,
  Ship,
  Zap,
  Activity,
  MapPin,
  ExternalLink,
  Loader2,
  ImageOff,
  Camera,
  Eye,
  Crosshair,
  X,
} from "lucide-react";
import { useData } from "@/context/DataContext";
import { authenticatedFetch } from "@/lib/authService";
import { cacheGet, cacheSet } from "@/lib/storageService";
import type { DataPoint } from "@/features/base/dataPoints";
import {
  getSquawkStatus,
  getSquawkStatusLabel,
} from "@/features/tracking/aircraft/lib/utils";

// ── Types ────────────────────────────────────────────────────────────

type AircraftPhoto = {
  src: string;
  link: string;
  photographer: string;
  width: number;
  height: number;
};

type LiveRoute = {
  source: "flightaware" | "hexdb";
  origin: {
    iata?: string;
    icao?: string;
    name?: string;
    city?: string;
    gate?: string;
  };
  destination: {
    iata?: string;
    icao?: string;
    name?: string;
    city?: string;
    gate?: string;
  };
  status?: string;
  departureTime?: number;
  arrivalTime?: number;
  departureActual?: boolean;
  arrivalActual?: boolean;
  delays?: { departure?: string; arrival?: string };
  filedRoute?: string;
  filedAltitude?: number;
  filedSpeed?: number;
  distance?: number;
  airline?: string;
};

type AircraftDossier = {
  icao24: string;
  aircraft: {
    ICAOTypeCode?: string;
    Manufacturer?: string;
    ModeS?: string;
    OperatorFlagCode?: string;
    RegisteredOwners?: string;
    Registration?: string;
    Type?: string;
  } | null;
  route: LiveRoute | null;
  photo: AircraftPhoto | null;
};

type DossierState = {
  status: "idle" | "loading" | "loaded" | "error";
  data: AircraftDossier | null;
  entityId: string | null;
};

// ── Cache ────────────────────────────────────────────────────────────

const CACHE_KEY = "sigint.dossier.cache.v1";
const CACHE_TTL_MS = 30 * 60_000;

type DossierCacheMap = Record<string, { dossier: AircraftDossier; ts: number }>;

function loadCache(): DossierCacheMap {
  try {
    return cacheGet<DossierCacheMap>(CACHE_KEY) ?? {};
  } catch {
    return {};
  }
}

function getCachedDossier(key: string): AircraftDossier | null {
  const cache = loadCache();
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.dossier;
}

function setCachedDossier(key: string, dossier: AircraftDossier): void {
  const cache = loadCache();
  cache[key] = { dossier, ts: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > 200) {
    const sorted = keys.sort((a, b) => cache[a]!.ts - cache[b]!.ts);
    for (let i = 0; i < sorted.length - 200; i++) delete cache[sorted[i]!];
  }
  cacheSet(CACHE_KEY, cache);
}

// ── MMSI country code ────────────────────────────────────────────────

function mmsiCountry(mmsi: number): string | null {
  const mid = Math.floor(mmsi / 1_000_000);
  const m: Record<number, string> = {
    201: "AL",
    202: "AD",
    203: "AT",
    204: "PT",
    205: "BE",
    206: "BY",
    207: "BG",
    209: "CY",
    210: "CY",
    211: "DE",
    212: "CY",
    213: "GE",
    214: "MD",
    215: "MT",
    216: "AM",
    218: "DE",
    219: "DK",
    220: "DK",
    224: "ES",
    225: "ES",
    226: "FR",
    227: "FR",
    228: "FR",
    229: "MT",
    230: "FI",
    231: "FO",
    232: "GB",
    233: "GB",
    234: "GB",
    235: "GB",
    236: "GI",
    237: "GR",
    238: "HR",
    239: "GR",
    240: "GR",
    241: "GR",
    242: "MA",
    243: "HU",
    244: "NL",
    245: "NL",
    246: "NL",
    247: "IT",
    248: "MT",
    249: "MT",
    250: "IE",
    251: "IS",
    253: "LU",
    255: "PT",
    256: "MT",
    257: "NO",
    258: "NO",
    259: "NO",
    261: "PL",
    263: "PT",
    264: "RO",
    265: "SE",
    266: "SE",
    267: "SK",
    269: "CH",
    270: "CZ",
    271: "TR",
    272: "UA",
    273: "RU",
    275: "LV",
    276: "EE",
    277: "LT",
    278: "SI",
    279: "ME",
    303: "US",
    306: "CW",
    307: "AW",
    308: "BS",
    310: "BM",
    312: "BZ",
    314: "BB",
    316: "CA",
    319: "KY",
    321: "CR",
    323: "CU",
    325: "DM",
    327: "DO",
    330: "GD",
    331: "GL",
    332: "GT",
    334: "HN",
    336: "HT",
    338: "US",
    339: "JM",
    345: "MX",
    350: "NI",
    351: "PA",
    352: "PA",
    353: "PA",
    354: "PA",
    355: "PA",
    356: "PA",
    357: "PA",
    358: "PR",
    359: "SV",
    362: "TT",
    366: "US",
    367: "US",
    368: "US",
    369: "US",
    370: "PA",
    371: "PA",
    372: "PA",
    373: "PA",
    374: "PA",
    401: "AF",
    403: "SA",
    405: "BD",
    410: "BT",
    412: "CN",
    413: "CN",
    414: "CN",
    416: "TW",
    417: "LK",
    419: "IN",
    422: "IR",
    425: "IQ",
    428: "IL",
    431: "JP",
    432: "JP",
    436: "KZ",
    438: "JO",
    440: "KR",
    441: "KR",
    447: "KW",
    450: "LB",
    457: "MN",
    461: "OM",
    463: "PK",
    466: "QA",
    468: "SY",
    470: "AE",
    473: "YE",
    475: "TH",
    477: "HK",
    501: "AQ",
    503: "AU",
    506: "MM",
    512: "NZ",
    525: "ID",
    533: "MY",
    538: "MH",
    548: "PH",
    553: "PG",
    563: "SG",
    564: "SG",
    565: "SG",
    566: "SG",
    574: "VN",
    576: "VU",
    601: "ZA",
    603: "AO",
    605: "DZ",
    622: "EG",
    624: "ET",
    626: "GA",
    627: "GH",
    634: "KE",
    636: "LR",
    637: "LR",
    657: "NG",
    659: "NA",
    672: "TN",
    674: "TZ",
    675: "UG",
    678: "ZM",
    679: "ZW",
  };
  return m[mid] ?? null;
}

// ── Component ────────────────────────────────────────────────────────

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
    const cached = getCachedDossier(cacheKey);
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
      setCachedDossier(cacheKey, dossier);
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
    if (next && selectedCurrent) {
      setZoomToId(selectedCurrent.id);
      setTimeout(() => setZoomToId(null), 100);
    }
  }, [isolateMode, setIsolateMode, setZoomToId, selectedCurrent]);

  const handleSolo = useCallback(() => {
    const next = isolateMode === "solo" ? null : "solo";
    setIsolateMode(next);
    if (next && selectedCurrent) {
      setZoomToId(selectedCurrent.id);
      setTimeout(() => setZoomToId(null), 100);
    }
  }, [isolateMode, setIsolateMode, setZoomToId, selectedCurrent]);

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
  } = acData;

  // ── Toolbar (always visible even while loading) ─────────────────

  const toolbar = (
    <div className="flex items-center gap-2 p-3 pb-0">
      <Plane className="w-4 h-4 text-sig-accent shrink-0" />
      <span className="text-sig-bright font-mono tracking-wider text-base truncate">
        {callsign?.trim() || icao24.toUpperCase()}
      </span>
      <div className="ml-auto flex items-center gap-1">
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
        <button
          onClick={handleClose}
          className="p-1.5 rounded text-sig-dim hover:text-sig-bright transition-colors"
          title="Deselect"
        >
          <X className="w-4 h-4" />
        </button>
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

  // Speed with mph
  const speedMph = Math.round(speed * 1.15078);
  const speedLine =
    typeof speedMps === "number"
      ? `${speed} kn (${speedMph} mph)`
      : `${speed} kn`;

  // Squawk
  const squawkLine = squawk
    ? `${squawk} — ${getSquawkStatusLabel(getSquawkStatus(squawk))}`
    : null;

  // V/S
  const vsLine =
    verticalRate != null ? `${Math.round(verticalRate * 196.85)} fpm` : null;

  // Category
  const category =
    categoryDescription && categoryDescription !== "UNKNOWN"
      ? categoryDescription
      : null;

  return (
    <div className="h-full flex flex-col">
      {toolbar}
      <div className="flex-1 overflow-y-auto sigint-scroll">
        <div className="p-3 space-y-3">
          {/* ── Photo ─────────────────────────────────────────── */}
          {photo && !photoError && (
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
                loading="lazy"
                onError={() => setPhotoError(true)}
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
          {photoError && (
            <div className="rounded bg-sig-bg/50 border border-sig-grid flex items-center justify-center h-20 text-sig-dim">
              <ImageOff className="w-4 h-4 mr-2 opacity-40" />
              <span className="text-xs">No photo available</span>
            </div>
          )}

          {/* ── Identity ──────────────────────────────────────── */}
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

          {/* ── Telemetry ─────────────────────────────────────── */}
          <Section title="TELEMETRY">
            <Row label="ALTITUDE" value={onGround ? "GND" : `${altitude} ft`} />
            <Row label="SPEED" value={speedLine} />
            <Row label="HEADING" value={`${heading}°`} />
            {vsLine && <Row label="V/S" value={vsLine} />}
            <Row label="STATUS" value={onGround ? "ON GROUND" : "AIRBORNE"} />
            {squawkLine && <Row label="SQUAWK" value={squawkLine} />}
          </Section>

          {/* ── Route ─────────────────────────────────────────── */}
          {route && (
            <Section
              title={route.source === "flightaware" ? "ROUTE" : "ROUTE *"}
            >
              {/* Airport codes */}
              <div className="flex items-center gap-2 text-sm text-sig-text">
                <RouteAirport apt={route.origin} />
                <span className="text-sig-dim">→</span>
                <RouteAirport apt={route.destination} />
              </div>

              {/* Status */}
              {route.status && (
                <Row
                  label="STATUS"
                  value={route.status.toUpperCase().replace("_", " ")}
                />
              )}

              {/* Origin details */}
              {route.origin?.name && (
                <Row
                  label="FROM"
                  value={`${route.origin.name}${route.origin.city ? ` — ${route.origin.city}` : ""}`}
                />
              )}
              {route.origin?.gate && (
                <Row label="GATE" value={route.origin.gate} />
              )}

              {/* Destination details */}
              {route.destination?.name && (
                <Row
                  label="TO"
                  value={`${route.destination.name}${route.destination.city ? ` — ${route.destination.city}` : ""}`}
                />
              )}
              {route.destination?.gate && (
                <Row label="GATE" value={route.destination.gate} />
              )}

              {/* Times */}
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

              {/* Delays */}
              {route.delays?.departure && (
                <Row label="DEP DELAY" value={route.delays.departure} />
              )}
              {route.delays?.arrival && (
                <Row label="ARR DELAY" value={route.delays.arrival} />
              )}

              {/* Flight plan */}
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

              {/* Source disclaimer for hexdb fallback */}
              {route.source === "hexdb" && (
                <div className="text-xs text-sig-dim/60 mt-1">
                  * Last known route — may not reflect current flight
                </div>
              )}
            </Section>
          )}

          {/* ── Coordinates ───────────────────────────────────── */}
          <Section title="POSITION">
            <div className="text-sm font-mono text-sig-dim">
              {Math.abs(selectedCurrent.lat).toFixed(3)}°
              {selectedCurrent.lat >= 0 ? "N" : "S"},{" "}
              {Math.abs(selectedCurrent.lon).toFixed(3)}°
              {selectedCurrent.lon >= 0 ? "E" : "W"}
            </div>
          </Section>

          {/* ── External links ────────────────────────────────── */}
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

// ── Non-aircraft dossier ─────────────────────────────────────────────

type NonAircraftProps = {
  readonly item: DataPoint;
  readonly isolateMode: null | "solo" | "focus";
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

function NonAircraftDossier({
  item,
  isolateMode,
  onFocus,
  onSolo,
  onClose,
}: NonAircraftProps) {
  const d = (item as any).data ?? {};

  const typeLabel: Record<string, string> = {
    ships: "AIS VESSEL",
    events: "GDELT EVENT",
    earthquake: "SEISMIC",
  };
  const TypeIcon: Record<string, typeof Plane> = {
    ships: Ship,
    events: Zap,
    earthquake: Activity,
  };
  const Icon = TypeIcon[item.type] ?? Activity;
  const label = typeLabel[item.type] ?? item.type.toUpperCase();

  const toolbar = (
    <div className="flex items-center gap-2 p-3 pb-0">
      <Icon className="w-4 h-4 text-sig-accent shrink-0" />
      <span className="text-sig-bright font-mono tracking-wider text-xs">
        {label}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <IsoBtn
          active={isolateMode === "focus"}
          label="FOCUS"
          icon={Eye}
          onClick={onFocus}
        />
        <IsoBtn
          active={isolateMode === "solo"}
          label="SOLO"
          icon={Crosshair}
          onClick={onSolo}
        />
        <button
          title="close"
          onClick={onClose}
          className="p-1.5 rounded text-sig-dim hover:text-sig-bright transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (item.type === "ships") {
    const {
      name,
      mmsi,
      imo,
      callSign,
      shipTypeLabel,
      navStatusLabel,
      sog,
      cog,
      heading,
      destination,
      draught,
      length,
      width,
    } = d;
    const country = mmsi ? mmsiCountry(mmsi) : null;
    return (
      <div className="h-full flex flex-col">
        {toolbar}
        <div className="flex-1 overflow-y-auto sigint-scroll">
          <div className="p-3 space-y-3">
            <div className="text-sig-bright font-mono tracking-wider text-base truncate">
              {name || `MMSI ${mmsi}`}
            </div>
            <Section title="IDENTITY">
              {mmsi && <Row label="MMSI" value={String(mmsi)} />}
              {imo && <Row label="IMO" value={String(imo)} />}
              {callSign && <Row label="CALL" value={callSign} />}
              {shipTypeLabel && shipTypeLabel !== "Unknown" && (
                <Row label="TYPE" value={shipTypeLabel} />
              )}
              {country && <Row label="FLAG" value={country} />}
              {destination && <Row label="DEST" value={destination} />}
            </Section>
            <Section title="TELEMETRY">
              {sog != null && (
                <Row label="SOG" value={`${sog.toFixed(1)} kn`} />
              )}
              {cog != null && <Row label="COG" value={`${cog.toFixed(0)}°`} />}
              {heading != null && heading !== 511 && (
                <Row label="HDG" value={`${heading}°`} />
              )}
              {navStatusLabel && navStatusLabel !== "Not defined" && (
                <Row label="NAV" value={navStatusLabel} />
              )}
            </Section>
            {(draught > 0 || length > 0 || width > 0) && (
              <Section title="DIMENSIONS">
                {length > 0 && <Row label="LEN" value={`${length}m`} />}
                {width > 0 && <Row label="BEAM" value={`${width}m`} />}
                {draught > 0 && <Row label="DRAFT" value={`${draught}m`} />}
              </Section>
            )}
            <Section title="POSITION">
              <div className="text-sm font-mono text-sig-dim">
                {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
                {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
              </div>
            </Section>
            <Section title="INTEL LINKS">
              {mmsi && (
                <LinkRow
                  label="MarineTraffic"
                  href={`https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}`}
                />
              )}
              {mmsi && (
                <LinkRow
                  label="VesselFinder"
                  href={`https://www.vesselfinder.com/vessels?mmsi=${mmsi}`}
                />
              )}
              {imo && (
                <LinkRow
                  label="Equasis"
                  href={`https://www.equasis.org/EquasisWeb/restricted/ShipInfo?fs=Search&P_IMO=${imo}`}
                />
              )}
            </Section>
          </div>
        </div>
      </div>
    );
  }

  if (item.type === "events") {
    const {
      actor1,
      actor2,
      eventCode,
      goldsteinScale,
      numMentions,
      numSources,
      sourceUrl,
      source,
      category,
    } = d;
    return (
      <div className="h-full flex flex-col">
        {toolbar}
        <div className="flex-1 overflow-y-auto sigint-scroll">
          <div className="p-3 space-y-3">
            <div className="text-sig-bright font-mono tracking-wider text-sm truncate">
              {actor1 || "Unknown actor"}
              {actor2 ? ` → ${actor2}` : ""}
            </div>
            <Section title="EVENT">
              {category && <Row label="TYPE" value={category} />}
              {eventCode && <Row label="CAMEO" value={eventCode} />}
              {goldsteinScale != null && (
                <Row label="GOLDSTEIN" value={String(goldsteinScale)} />
              )}
              {numMentions != null && (
                <Row label="MENTIONS" value={String(numMentions)} />
              )}
              {numSources != null && (
                <Row label="SOURCES" value={String(numSources)} />
              )}
              {source && <Row label="OUTLET" value={source} />}
            </Section>
            <Section title="POSITION">
              <div className="text-sm font-mono text-sig-dim">
                {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
                {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
              </div>
            </Section>
            {sourceUrl && (
              <Section title="SOURCE">
                <LinkRow label="Read article" href={sourceUrl} />
              </Section>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (item.type === "quakes") {
    const { place, magnitude, depth, tsunamiAlert, felt, url, magType } = d;
    return (
      <div className="h-full flex flex-col">
        {toolbar}
        <div className="flex-1 overflow-y-auto sigint-scroll">
          <div className="p-3 space-y-3">
            <div className="text-sig-bright font-mono tracking-wider text-sm truncate">
              {place || "Unknown location"}
            </div>
            <Section title="SEISMIC">
              {magnitude != null && (
                <Row label="MAG" value={`${magnitude} ${magType ?? ""}`} />
              )}
              {depth != null && <Row label="DEPTH" value={`${depth} km`} />}
              {tsunamiAlert != null && (
                <Row label="TSUNAMI" value={tsunamiAlert ? "⚠ ALERT" : "No"} />
              )}
              {felt != null && felt > 0 && (
                <Row label="FELT BY" value={`${felt} reports`} />
              )}
            </Section>
            <Section title="POSITION">
              <div className="text-sm font-mono text-sig-dim">
                {/* @ts-ignore */}
                {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
                {/* @ts-ignore */}
                {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
              </div>
            </Section>
            {url && (
              <Section title="SOURCE">
                <LinkRow label="USGS Detail" href={url} />
              </Section>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {toolbar}
      <div className="flex-1 flex items-center justify-center text-sig-dim">
        <Icon className="w-6 h-6 opacity-30" />
      </div>
    </div>
  );
}

// ── Shared UI atoms ──────────────────────────────────────────────────

function IsoBtn({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly icon: typeof Eye;
  readonly onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono tracking-wider transition-colors border ${
        active
          ? "text-sig-accent bg-sig-accent/15 border-sig-accent/40"
          : "text-sig-dim bg-transparent border-sig-grid/50 hover:text-sig-text"
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-sig-accent tracking-widest mb-1.5 border-b border-sig-grid/40 pb-0.5">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  if (!value || value === "UNKNOWN" || value === "Unknown") return null;
  return (
    <div className="flex justify-between text-sm gap-2">
      <span className="text-sig-dim shrink-0">{label}</span>
      <span className="text-sig-text text-right truncate font-mono">
        {value}
      </span>
    </div>
  );
}

function RouteAirport({
  apt,
}: {
  readonly apt: { iata?: string; icao?: string; name?: string };
}) {
  const code = apt.iata || apt.icao || "???";
  return (
    <div className="flex items-center gap-1">
      <MapPin className="w-3 h-3 text-sig-dim" />
      <span className="font-mono text-sig-bright">{code}</span>
    </div>
  );
}

function formatEpoch(epoch: number): string {
  const d = new Date(epoch * 1000);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

function LinkRow({
  label,
  href,
}: {
  readonly label: string;
  readonly href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between text-sm text-sig-accent hover:text-sig-bright transition-colors py-0.5"
    >
      <span>{label}</span>
      <ExternalLink className="w-3 h-3 shrink-0" />
    </a>
  );
}
