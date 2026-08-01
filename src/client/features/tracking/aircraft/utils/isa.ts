export enum AircraftIsaValue {
  MinimumAltitudeFeet = 0,
  NormalizedRatio = 1,
  SeaLevelSpeedKnots = 661.4788,
  SpeedLapseRatePerFoot = 6.8755856e-6,
  TropopauseAltitudeFeet = 36_089,
  TropopauseSpeedKnots = 573.8,
  SeaLevelTemperatureCelsius = 15,
  TropopauseTemperatureCelsius = -56.5,
  TemperatureLapsePerThousandFeet = 1.98,
  FeetPerThousand = 1_000,
}

export function isaSpeedOfSoundKt(altitudeFeet: number): number {
  if (altitudeFeet >= AircraftIsaValue.TropopauseAltitudeFeet) {
    return AircraftIsaValue.TropopauseSpeedKnots;
  }
  return (
    AircraftIsaValue.SeaLevelSpeedKnots *
    Math.sqrt(
      AircraftIsaValue.NormalizedRatio -
        AircraftIsaValue.SpeedLapseRatePerFoot *
          Math.max(AircraftIsaValue.MinimumAltitudeFeet, altitudeFeet),
    )
  );
}

export function machFromGs(
  groundSpeedKnots: number,
  altitudeFeet: number,
): number {
  return groundSpeedKnots / isaSpeedOfSoundKt(altitudeFeet);
}

export function isaTempC(altitudeFeet: number): number {
  if (altitudeFeet >= AircraftIsaValue.TropopauseAltitudeFeet) {
    return AircraftIsaValue.TropopauseTemperatureCelsius;
  }
  return (
    AircraftIsaValue.SeaLevelTemperatureCelsius -
    AircraftIsaValue.TemperatureLapsePerThousandFeet *
      (altitudeFeet / AircraftIsaValue.FeetPerThousand)
  );
}
