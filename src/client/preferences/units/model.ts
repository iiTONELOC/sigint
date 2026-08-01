export enum UnitMode {
  Both = "both",
  KilometersPerHour = "kmh",
  Knots = "kt",
  MilesPerHour = "mph",
}

/** Return whether a cached value is a supported unit mode. */
export function isUnitMode(
  value: unknown,
): value is UnitMode {
  switch (value) {
    case UnitMode.Both:
    case UnitMode.KilometersPerHour:
    case UnitMode.Knots:
    case UnitMode.MilesPerHour:
      return true;
    default:
      return false;
  }
}
