import { CompassPoint } from "@shared/domain/compass";

enum CoordinateFormatPolicy {
  FractionDigits = 3,
}

/** Return a signed latitude with its hemisphere. */
export function formatLat(
  latitude: number,
  fractionDigits: number = CoordinateFormatPolicy.FractionDigits,
): string {
  const hemisphere = latitude >= 0
    ? CompassPoint.North
    : CompassPoint.South;
  return `${Math.abs(latitude).toFixed(fractionDigits)}°${hemisphere}`;
}

/** Return a signed longitude with its hemisphere. */
export function formatLon(
  longitude: number,
  fractionDigits: number = CoordinateFormatPolicy.FractionDigits,
): string {
  const hemisphere = longitude >= 0
    ? CompassPoint.East
    : CompassPoint.West;
  return `${Math.abs(longitude).toFixed(fractionDigits)}°${hemisphere}`;
}
