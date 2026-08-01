import { Camera } from "lucide-react";
import { Barcode } from "@/components/Barcode";
import { DetailField, DetailFieldAlign } from "@/dossier";
import type { AircraftChip } from "./dossierKit";
import { NO_VALUE } from "@shared/text";

enum AircraftPhotoPlateGeometry {
  CenterX = 100,
  CenterY = 52,
  FillOpacity = 0.5,
  InnerRadius = 18,
  MiddleRadius = 34,
  OuterRadius = 50,
  RotationDegrees = -28,
  StrokeOpacity = 0.22,
}

enum AircraftPhotoPlateAttribute {
  ViewBox = "0 0 200 120",
}

function NoPhotoPlate() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-linear-to-b from-sig-bg to-sig-panel">
      <svg
        viewBox={AircraftPhotoPlateAttribute.ViewBox}
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        aria-hidden
      >
        <g
          className="stroke-sig-dim"
          fill="none"
          strokeOpacity={AircraftPhotoPlateGeometry.StrokeOpacity}
        >
          <circle
            cx={AircraftPhotoPlateGeometry.CenterX}
            cy={AircraftPhotoPlateGeometry.CenterY}
            r={AircraftPhotoPlateGeometry.InnerRadius}
          />
          <circle
            cx={AircraftPhotoPlateGeometry.CenterX}
            cy={AircraftPhotoPlateGeometry.CenterY}
            r={AircraftPhotoPlateGeometry.MiddleRadius}
          />
          <circle
            cx={AircraftPhotoPlateGeometry.CenterX}
            cy={AircraftPhotoPlateGeometry.CenterY}
            r={AircraftPhotoPlateGeometry.OuterRadius}
          />
        </g>
        <g
          transform={`translate(${AircraftPhotoPlateGeometry.CenterX},${AircraftPhotoPlateGeometry.CenterY}) rotate(${AircraftPhotoPlateGeometry.RotationDegrees})`}
          className="fill-sig-dim"
          fillOpacity={AircraftPhotoPlateGeometry.FillOpacity}
        >
          <path d="M0,-24 L3,-7 L28,6 L28,11 L3,4 L2,19 L9,24 L9,27 L0,25 L-9,27 L-9,24 L-2,19 L-3,4 L-28,11 L-28,6 L-3,-7 Z" />
        </g>
      </svg>
    </div>
  );
}

type Photo = {
  readonly src?: string;
  readonly link?: string;
  readonly photographer?: string;
};

type Props = {
  readonly photo: Photo | null;
  readonly photoLoading: boolean;
  readonly photoError: boolean;
  readonly onPhotoError: () => void;
  readonly typeBadge: string;
  readonly military: boolean;
  readonly recon: boolean;
  readonly operator: string;
  readonly chip: AircraftChip | null;
  readonly reg: string;
  readonly icao24: string;
  readonly originCountry: string;
  readonly model: string;
  readonly aircraft: string;
  readonly mfr: string;
  readonly wake: string | null;
};

type AircraftPhotoProps = Readonly<{
  error: boolean;
  fallbackText: string;
  loading: boolean;
  onError: () => void;
  photo: Photo | null;
}>;

function AircraftPhoto({
  error,
  fallbackText,
  loading,
  onError,
  photo,
}: AircraftPhotoProps) {
  if (photo?.src && !error) {
    return (
      <a
        href={photo.link}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 block"
      >
        <img
          src={photo.src}
          alt={fallbackText}
          className="w-full h-full object-cover"
          onError={onError}
        />
      </a>
    );
  }
  if (loading) {
    return (
      <div className="absolute inset-0 animate-pulse bg-linear-to-b from-sig-border/40 to-sig-panel" />
    );
  }
  return (
    <div className="absolute inset-0">
      <NoPhotoPlate />
    </div>
  );
}

export function AircraftIdentityTicket({
  photo,
  photoLoading,
  photoError,
  onPhotoError,
  typeBadge,
  military,
  recon,
  operator,
  chip,
  reg,
  icao24,
  originCountry,
  model,
  aircraft,
  mfr,
  wake,
}: Props) {
  const hasPhoto = Boolean(photo?.src) && !photoError;

  const badges = (
    <div className="flex gap-1.5">
      {recon && (
        <span className="text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 text-sig-recon border border-sig-recon/40 backdrop-blur-sm">
          RECON
        </span>
      )}
      {military && (
        <span className="text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 text-sig-bright border border-sig-bright/40 backdrop-blur-sm">
          MIL
        </span>
      )}
      {typeBadge && (
        <span className="text-(length:--sig-text-xs) font-bold tracking-wider px-1.5 py-0.5 rounded bg-sig-bg/70 text-(--dossier-accent) border border-(--dossier-accent)/40 backdrop-blur-sm">
          {typeBadge}
        </span>
      )}
    </div>
  );

  const identity = (
    <>
      <div className="flex items-center gap-2">
        <span className="text-(length:--sig-text-lg) text-sig-bright font-bold truncate">
          {operator || "Unknown operator"}
        </span>
        {chip && (
          <span
            className={`ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-(length:--sig-text-xs) font-bold tracking-wider ${chip.tone}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {chip.label}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-3 mt-1.5">
        <div className="min-w-0">
          <div className="text-(length:--sig-text-xs) tracking-wider text-sig-dim">REGISTRATION</div>
          <div className="text-(length:--sig-text-title) text-sig-bright tracking-wider leading-none">
            {reg || NO_VALUE}
          </div>
        </div>
        {originCountry && (
          <DetailField
            label="ORIGIN"
            value={originCountry}
            align={DetailFieldAlign.Right}
          />
        )}
      </div>
    </>
  );

  return (
    <div className="relative bg-sig-panel border border-sig-border rounded-2xl overflow-hidden flex flex-col h-full">
      <div className="h-1 bg-linear-to-r from-(--dossier-accent) via-sig-bright/40 to-(--dossier-accent)" />

      <div className="relative w-full bg-sig-bg overflow-hidden h-[12.4rem] @min-[40rem]/dossier:h-auto @min-[40rem]/dossier:min-h-0 @min-[40rem]/dossier:flex-1">
        <AircraftPhoto
          error={photoError}
          fallbackText={reg || icao24}
          loading={photoLoading}
          onError={onPhotoError}
          photo={photo}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-linear-to-t from-sig-panel via-sig-panel/85 to-transparent" />
        <div className="absolute top-2 right-2">{badges}</div>
        {hasPhoto && photo?.photographer && (
          <div className="absolute top-2 left-2 flex items-center gap-1 text-(length:--sig-text-xs) text-sig-bright/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
            <Camera className="w-3 h-3 shrink-0" aria-hidden />
            <span className="truncate max-w-40">{photo.photographer}</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-3">{identity}</div>
      </div>

      <div className="relative h-5">
        <div className="absolute left-3.5 right-3.5 top-1/2 border-t border-dashed border-sig-border" />
        <div className="absolute top-1/2 -translate-y-1/2 -left-2.5 w-5 h-5 rounded-full bg-sig-bg border border-sig-border" />
        <div className="absolute top-1/2 -translate-y-1/2 -right-2.5 w-5 h-5 rounded-full bg-sig-bg border border-sig-border" />
      </div>

      <div className="px-4 pb-4">
        <div className="grid grid-cols-3 gap-x-4 gap-y-2 mb-3">
          {model && <DetailField label="MODEL" value={model} />}
          {aircraft && aircraft !== model && (
            <DetailField label="AIRCRAFT" value={aircraft} />
          )}
          {mfr && <DetailField label="MFR" value={mfr} />}
          {wake && <DetailField label="WAKE" value={wake} />}
        </div>
        <div className="h-11 rounded-md bg-sig-bg border border-sig-border flex items-center gap-2.5 px-3">
          <Barcode value={icao24} className="flex-1 h-7" />
          <span className="text-(length:--sig-text-sm) tracking-[0.2em] text-sig-bright">
            {icao24.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}
