export enum MeasurementFixtureAviationExpected {
  Mach = 1,
  SeaLevelSpeedKnots = 661.4788,
  SeaLevelTemperatureCelsius = 15,
  TropopauseSpeedKnots = 573.8,
  TropopauseTemperatureCelsius = -56.5,
}

export enum MeasurementFixtureAviationInput {
  GroundSpeedKnots = 661.4788,
  SeaLevelAltitudeFeet = 0,
  TropopauseAltitudeFeet = 36_089,
}

export enum MeasurementFixtureConversionExpected {
  Celsius = 0,
  Fahrenheit = 32,
  FeetPerMinute = 1_968.5,
  Feet = 1_083,
  Kilometers = 76,
  KilometersPerHour = 157,
  Meters = 330,
  MetersPerSecond = 43.724,
  MetersPerSecondFromFeetPerMinute = 10,
  Miles = 6,
  MilesPerHour = 98,
}

export enum MeasurementFixtureConversionInput {
  Celsius = 0,
  DistanceKilometers = 10,
  FeetPerMinute = 1_968.5,
  FootprintKilometers = 0.33,
  Kelvin = 273.15,
  Knots = 85,
  MetersPerSecond = 10,
  NauticalMiles = 41,
}

export enum MeasurementFixtureCopy {
  Bearing = "290°",
  DistanceBoth = "10 km (6 mi)",
  DistanceImperial = "6 mi",
  DistanceMetric = "10 km",
  FootprintBoth = "330 × 550 m (1083 × 1804 ft)",
  FootprintImperial = "1083 × 1804 ft",
  FootprintMetric = "330 × 550 m",
  NauticalDistance = "41 nm (76 km)",
  Pressure = "950 mb",
  SpeedBoth = "85 kn (98 mph)",
  SpeedKilometersPerHour = "157 km/h",
  SpeedKnots = "85 kn",
  SpeedMilesPerHour = "98 mph",
  SpeedShortBoth = "85kn/98mph",
  SpeedShortKilometersPerHour = "157km/h",
  SpeedShortKnots = "85kn",
  SpeedShortMilesPerHour = "98mph",
  TemperatureBoth = "33 °C (91 °F)",
  TemperatureImperial = "91 °F",
  TemperatureMetric = "33 °C",
}

export enum MeasurementFixtureCycloneInput {
  BearingDegrees = 290,
  NauticalMiles = 41,
  PressureMillibars = 950,
}

export enum MeasurementFixtureFireInput {
  BrightnessKelvin = 306.15,
  ScanKilometers = 0.33,
  TrackKilometers = 0.55,
}
