import { TurnDeg } from "@shared/geo";

export enum CompassPoint {
  North = "N",
  NorthNortheast = "NNE",
  Northeast = "NE",
  EastNortheast = "ENE",
  East = "E",
  EastSoutheast = "ESE",
  Southeast = "SE",
  SouthSoutheast = "SSE",
  South = "S",
  SouthSouthwest = "SSW",
  Southwest = "SW",
  WestSouthwest = "WSW",
  West = "W",
  WestNorthwest = "WNW",
  Northwest = "NW",
  NorthNorthwest = "NNW",
}

enum CompassCalculation {
  ZeroDegrees = 0,
}

export function compassPointForDegrees(degrees: number): CompassPoint {
  const points = Object.values(CompassPoint);
  const normalized =
    ((degrees % TurnDeg.Full) + TurnDeg.Full) % TurnDeg.Full;
  const step = TurnDeg.Full / points.length;
  const index = Math.round(normalized / step) % points.length;
  return points[index] ?? CompassPoint.North;
}

export function cardinalCompassPointForDegrees(
  degrees: number,
): CompassPoint | null {
  return degrees % TurnDeg.Quarter === CompassCalculation.ZeroDegrees
    ? compassPointForDegrees(degrees)
    : null;
}
