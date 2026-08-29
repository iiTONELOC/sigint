import {
  DossierMiniGlobe,
  type DossierMiniGlobeCamera,
  type DossierMiniGlobeDrawContext,
} from "@/dossier";
import { AIS_HEADING_UNAVAILABLE } from "@shared/domain/ships";
import { AngleConversion, GeoLimit, TurnDeg } from "@shared/geo";

const rad = (degrees: number) => degrees * AngleConversion.RadiansPerDegree;

function bearingPt(
  x: number,
  y: number,
  degrees: number,
  length: number,
): [number, number] {
  const angle = rad(degrees);
  return [
    x + length * Math.sin(angle),
    y - length * Math.cos(angle),
  ];
}

export function ShipMiniMap({
  lat,
  lon,
  heading,
  cog,
  sog,
  trail,
}: {
  readonly lat: number;
  readonly lon: number;
  readonly heading?: number;
  readonly cog?: number;
  readonly sog?: number;
  readonly trail: readonly { lat: number; lon: number }[];
}) {
  const points = [...trail, { lat, lon }];
  let minLat = GeoLimit.MaxLatitude;
  let maxLat = GeoLimit.MinLatitude;
  let minLon = GeoLimit.MaxLongitude;
  let maxLon = GeoLimit.MinLongitude;
  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLon = Math.min(minLon, point.lon);
    maxLon = Math.max(maxLon, point.lon);
  }
  const centerLatitude = (minLat + maxLat) / 2;
  const centerLongitude = (minLon + maxLon) / 2;
  const latitudeSpan = maxLat - minLat;
  const longitudeSpan =
    (maxLon - minLon) * Math.cos(rad(centerLatitude));
  const spanDegrees = Math.max(latitudeSpan, longitudeSpan, 0.4);
  const spanRadius = Math.max(Math.sin(rad(spanDegrees / 2)), 0.05);
  const camera: DossierMiniGlobeCamera = {
    centerLatitude,
    centerLongitude,
    maximumZoom: 12,
    minimumZoom: 0.4,
    radiusScale: Math.min(0.8 / spanRadius, 60),
    spanDegrees,
  };

  const drawOverlay = ({
    colors,
    context,
    project,
  }: DossierMiniGlobeDrawContext): void => {
    const accent = colors.ships;
    if (trail.length > 0) {
      context.strokeStyle = accent;
      context.globalAlpha = 0.6;
      context.lineWidth = 1.5;
      context.beginPath();
      let drawing = false;
      for (const point of points) {
        const projection = project(point.lat, point.lon);
        if (projection.z > 0) {
          if (drawing) context.lineTo(projection.x, projection.y);
          else {
            context.moveTo(projection.x, projection.y);
            drawing = true;
          }
        } else {
          drawing = false;
        }
      }
      context.stroke();
      context.globalAlpha = 1;
    }

    const position = project(lat, lon);
    if (position.z <= 0) return;
    const vectorLength = Math.min(64, 16 + (sog ?? 0) * 2.5);
    if (cog !== undefined) {
      const [vectorX, vectorY] = bearingPt(
        position.x,
        position.y,
        cog,
        vectorLength,
      );
      context.setLineDash([4, 3]);
      context.strokeStyle = accent;
      context.globalAlpha = 0.9;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(position.x, position.y);
      context.lineTo(vectorX, vectorY);
      context.stroke();
      context.setLineDash([]);
      context.globalAlpha = 1;
    }
    if (heading !== undefined && heading !== AIS_HEADING_UNAVAILABLE) {
      const [headingX, headingY] = bearingPt(
        position.x,
        position.y,
        heading,
        vectorLength * 0.7,
      );
      context.strokeStyle = colors.bright;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(position.x, position.y);
      context.lineTo(headingX, headingY);
      context.stroke();
    }
    const fullCircleRadians =
      TurnDeg.Full * AngleConversion.RadiansPerDegree;
    context.beginPath();
    context.arc(
      position.x,
      position.y,
      3.5,
      0,
      fullCircleRadians,
    );
    context.fillStyle = accent;
    context.fill();
    context.beginPath();
    context.arc(
      position.x,
      position.y,
      6,
      0,
      fullCircleRadians,
    );
    context.strokeStyle = accent;
    context.lineWidth = 1.25;
    context.stroke();
  };

  return (
    <DossierMiniGlobe
      ariaLabel="Vessel position and track over coastline"
      camera={camera}
      drawOverlay={drawOverlay}
      resetKey={`${lat}:${lon}`}
    />
  );
}
