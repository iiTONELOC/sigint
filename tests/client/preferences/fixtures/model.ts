export enum PreferenceFixtureCount {
  Empty = 0,
  Single = 1,
  Pair = 2,
}

export enum PreferenceFixtureInvalid {
  UnitMode = "fixture-invalid-unit-mode",
}

export enum PreferenceFixtureProbe {
  Cyclones = "fixture-cyclone-preference",
  Units = "fixture-units-preference",
}

export enum PreferenceFixtureTestError {
  ProbeMissing = "The preference fixture probe is missing.",
  WriteMissing = "The preference fixture write is missing.",
}
