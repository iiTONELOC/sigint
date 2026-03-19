import {
  Plane,
  Ship,
  Zap,
  Activity,
  Flame,
  CloudAlert,
  Eye,
  Crosshair,
  LocateFixed,
  X,
} from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import { IsoBtn, Section, Row, LinkRow, mmsiCountry } from "./DossierAtoms";

type NonAircraftProps = {
  readonly item: DataPoint;
  readonly isolateMode: null | "solo" | "focus";
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

export function NonAircraftDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: NonAircraftProps) {
  const d = (item as any).data ?? {};

  const typeLabel: Record<string, string> = {
    ships: "AIS VESSEL",
    events: "GDELT EVENT",
    quakes: "SEISMIC",
    fires: "FIRE HOTSPOT",
    weather: "WEATHER ALERT",
  };
  const TypeIcon: Record<string, typeof Plane> = {
    ships: Ship,
    events: Zap,
    quakes: Activity,
    fires: Flame,
    weather: CloudAlert,
  };
  const Icon = TypeIcon[item.type] ?? Activity;
  const label = typeLabel[item.type] ?? item.type.toUpperCase();

  const toolbar = (
    <div className="p-3 pb-0">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-sig-accent shrink-0" />
        <span className="text-sig-bright font-mono tracking-wider text-xs flex-1">
          {label}
        </span>
        <button
          title="close"
          onClick={onClose}
          className="p-1.5 rounded text-sig-dim hover:text-sig-bright transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-1 mt-1.5">
        <IsoBtn
          active={false}
          label="LOCATE"
          icon={LocateFixed}
          onClick={onLocate}
        />
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
      </div>
    </div>
  );

  const positionSection = (
    <Section title="POSITION">
      <div className="text-sm font-mono text-sig-dim">
        {Math.abs(item.lat).toFixed(3)}°{item.lat >= 0 ? "N" : "S"},{" "}
        {Math.abs(item.lon).toFixed(3)}°{item.lon >= 0 ? "E" : "W"}
      </div>
    </Section>
  );

  if (item.type === "ships") {
    const {
      name, mmsi, imo, callSign, shipTypeLabel, navStatusLabel,
      sog, cog, heading, destination, draught, length, width,
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
            {positionSection}
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
    const { headline, category, severity, tone, source, sourceCountry, locationName, url } = d;
    const toneLabel =
      tone != null
        ? tone <= -15 ? "VERY NEGATIVE"
          : tone <= -5 ? "NEGATIVE"
          : tone <= -1 ? "SLIGHTLY NEGATIVE"
          : tone <= 1 ? "NEUTRAL"
          : tone <= 5 ? "SLIGHTLY POSITIVE"
          : "POSITIVE"
        : null;

    return (
      <div className="h-full flex flex-col">
        {toolbar}
        <div className="flex-1 overflow-y-auto sigint-scroll">
          <div className="p-3 space-y-3">
            <div className="text-sig-bright font-mono tracking-wider text-sm truncate">
              {headline || "Unknown event"}
            </div>
            <Section title="EVENT">
              {category && <Row label="TYPE" value={category} />}
              {severity != null && (
                <Row
                  label="SEVERITY"
                  value={"\u2588".repeat(severity) + "\u2591".repeat(5 - severity)}
                />
              )}
              {tone != null && (
                <Row label="TONE" value={`${tone.toFixed(1)} ${toneLabel}`} />
              )}
              {source && <Row label="OUTLET" value={source} />}
              {sourceCountry && <Row label="ORIGIN" value={sourceCountry} />}
              {locationName && <Row label="LOCATION" value={locationName} />}
            </Section>
            {positionSection}
            {url && (
              <Section title="SOURCE">
                <LinkRow label="Read article" href={url} />
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
            {positionSection}
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

  if (item.type === "weather") {
    const {
      event, severity, urgency, certainty, headline, description,
      instruction, senderName, areaDesc, onset, expires, category, response,
    } = d;
    return (
      <div className="h-full flex flex-col">
        {toolbar}
        <div className="flex-1 overflow-y-auto sigint-scroll">
          <div className="p-3 space-y-3">
            <div className="text-sig-bright font-mono tracking-wider text-sm truncate">
              {(event as string) || "Weather Alert"}
            </div>
            {headline && (
              <div className="text-sig-text text-sm leading-snug">
                {headline as string}
              </div>
            )}
            <Section title="ALERT">
              {severity && <Row label="SEVERITY" value={(severity as string).toUpperCase()} />}
              {urgency && <Row label="URGENCY" value={urgency as string} />}
              {certainty && <Row label="CERTAINTY" value={certainty as string} />}
              {category && <Row label="CATEGORY" value={category as string} />}
              {response && <Row label="RESPONSE" value={response as string} />}
            </Section>
            <Section title="AREA">
              {areaDesc && (
                <div className="text-sm text-sig-text leading-snug">
                  {(areaDesc as string).split(";").slice(0, 5).join("; ")}
                  {(areaDesc as string).split(";").length > 5 && "..."}
                </div>
              )}
              {senderName && <Row label="ISSUER" value={senderName as string} />}
            </Section>
            <Section title="TIMING">
              {onset && <Row label="ONSET" value={new Date(onset as string).toLocaleString()} />}
              {expires && <Row label="EXPIRES" value={new Date(expires as string).toLocaleString()} />}
            </Section>
            {description && (
              <Section title="DETAILS">
                <div className="text-xs text-sig-text/70 leading-relaxed max-h-40 overflow-y-auto sigint-scroll whitespace-pre-wrap">
                  {(description as string).slice(0, 800)}
                  {(description as string).length > 800 && "..."}
                </div>
              </Section>
            )}
            {instruction && (
              <Section title="INSTRUCTIONS">
                <div className="text-xs text-sig-text/70 leading-relaxed max-h-32 overflow-y-auto sigint-scroll whitespace-pre-wrap">
                  {(instruction as string).slice(0, 500)}
                  {(instruction as string).length > 500 && "..."}
                </div>
              </Section>
            )}
            {positionSection}
          </div>
        </div>
      </div>
    );
  }

  if (item.type === "fires") {
    const {
      frp, brightness, brightT31, confidence, satellite, instrument,
      daynight, scan, track, acqDate, acqTime,
    } = d;
    return (
      <div className="h-full flex flex-col">
        {toolbar}
        <div className="flex-1 overflow-y-auto sigint-scroll">
          <div className="p-3 space-y-3">
            <div className="text-sig-bright font-mono tracking-wider text-sm truncate">
              Fire Hotspot
              {frp ? ` — FRP ${(frp as number).toFixed(1)} MW` : ""}
            </div>
            <Section title="THERMAL">
              {frp != null && (frp as number) > 0 && (
                <Row label="FRP" value={`${(frp as number).toFixed(1)} MW`} />
              )}
              {brightness != null && (brightness as number) > 0 && (
                <Row label="BRIGHTNESS" value={`${(brightness as number).toFixed(1)} K`} />
              )}
              {brightT31 != null && (brightT31 as number) > 0 && (
                <Row label="BRIGHT T31" value={`${(brightT31 as number).toFixed(1)} K`} />
              )}
              {confidence && <Row label="CONFIDENCE" value={(confidence as string).toUpperCase()} />}
            </Section>
            <Section title="DETECTION">
              {satellite && <Row label="SATELLITE" value={satellite as string} />}
              {instrument && <Row label="INSTRUMENT" value={instrument as string} />}
              {daynight && <Row label="TIME" value={daynight === "D" ? "DAYTIME" : "NIGHTTIME"} />}
              {scan != null && track != null && (
                <Row label="PIXEL" value={`${(scan as number).toFixed(1)} × ${(track as number).toFixed(1)} km`} />
              )}
              {acqDate && (
                <Row
                  label="DATE"
                  value={`${acqDate}${acqTime ? ` ${(acqTime as string).slice(0, 2)}:${(acqTime as string).slice(2)}Z` : ""}`}
                />
              )}
            </Section>
            {positionSection}
            <Section title="INTEL LINKS">
              <LinkRow
                label="NASA FIRMS Map"
                href={`https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${item.lon},${item.lat},10z`}
              />
              <LinkRow
                label="Google Maps (Satellite)"
                href={`https://www.google.com/maps/@${item.lat},${item.lon},14z/data=!3m1!1e1`}
              />
            </Section>
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
