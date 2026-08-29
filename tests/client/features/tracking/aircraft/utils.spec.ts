import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import {
  type AircraftData,
  type AircraftPoint,
  MilFilter,
  SquawkBucket,
  SquawkCode,
  SquawkStatus,
  squawkStatusFor,
  squawkStatusLabel,
} from "@shared/domain/aircraft";
import {
  normalizeIcao24,
} from "@shared/domain/aircraftDossier";
import {
  matchesAircraftFilter,
  type AircraftFilterValues,
} from "@shared/domain/aircraftFilter";

enum AircraftFixtureCoordinate {
  Origin = 0,
}

enum AircraftFixtureText {
  Empty = "",
  IcaoLower = "abc123",
  IcaoQuoted = "'abc123'",
  IcaoShort = "abc",
  IcaoSpaced = "  abc123  ",
  IcaoUpper = "ABC123",
  InvalidIcao = "xyz123",
  OtherSquawk = "1200",
  UnitedKingdom = "UK",
  UnitedStates = "US",
}

function aircraftPoint(
  data: Partial<AircraftData> = {},
): AircraftPoint {
  return {
    data: {
      onGround: false,
      originCountry: AircraftFixtureText.UnitedStates,
      squawk: AircraftFixtureText.OtherSquawk,
      ...data,
    },
    id: "aircraft-fixture",
    position: [
      AircraftFixtureCoordinate.Origin,
      AircraftFixtureCoordinate.Origin,
    ],
    type: Domain.Aircraft,
  };
}

function aircraftFilter(
  values: Partial<AircraftFilterValues> = {},
): AircraftFilterValues {
  return {
    countries: [],
    enabled: true,
    milFilter: MilFilter.All,
    showAirborne: true,
    showGround: true,
    squawks: [],
    ...values,
  };
}

describe("normalizeIcao24", () => {
  test("normalizes live ICAO values", () => {
    expect(normalizeIcao24(AircraftFixtureText.IcaoUpper)).toBe(
      AircraftFixtureText.IcaoLower,
    );
    expect(normalizeIcao24(AircraftFixtureText.IcaoSpaced)).toBe(
      AircraftFixtureText.IcaoLower,
    );
    expect(normalizeIcao24(AircraftFixtureText.IcaoQuoted)).toBe(
      AircraftFixtureText.IcaoLower,
    );
    expect(normalizeIcao24(AircraftFixtureText.IcaoShort)).toBeNull();
  });

  test("rejects absent and invalid ICAO values", () => {
    expect(normalizeIcao24(AircraftFixtureText.Empty)).toBeNull();
    expect(normalizeIcao24(AircraftFixtureText.InvalidIcao)).toBeNull();
    expect(normalizeIcao24(undefined)).toBeNull();
  });
});

describe("aircraft squawk presentation", () => {
  test("classifies the three emergency codes", () => {
    expect(squawkStatusFor(SquawkCode.Emergency)).toBe(
      SquawkStatus.Emergency,
    );
    expect(squawkStatusFor(SquawkCode.RadioFailure)).toBe(
      SquawkStatus.RadioFailure,
    );
    expect(squawkStatusFor(SquawkCode.Hijack)).toBe(
      SquawkStatus.Hijack,
    );
  });

  test("classifies other and absent codes as normal", () => {
    expect(squawkStatusFor(AircraftFixtureText.OtherSquawk)).toBe(
      SquawkStatus.Normal,
    );
    expect(squawkStatusFor(undefined)).toBe(SquawkStatus.Normal);
  });

  test("resolves the current status labels", () => {
    expect(squawkStatusLabel(SquawkStatus.Emergency)).toBe("EMERGENCY");
    expect(squawkStatusLabel(SquawkStatus.RadioFailure)).toBe(
      "RADIO FAILURE",
    );
    expect(squawkStatusLabel(SquawkStatus.Hijack)).toBe("HIJACK");
    expect(squawkStatusLabel(SquawkStatus.Normal)).toBe("NORMAL");
  });
});

describe("matchesAircraftFilter", () => {
  test("accepts the default airborne aircraft", () => {
    expect(
      matchesAircraftFilter(aircraftPoint(), aircraftFilter()),
    ).toBe(true);
  });

  test("rejects every aircraft when disabled", () => {
    expect(
      matchesAircraftFilter(
        aircraftPoint(),
        aircraftFilter({ enabled: false }),
      ),
    ).toBe(false);
  });

  test("applies airborne and ground visibility", () => {
    expect(
      matchesAircraftFilter(
        aircraftPoint(),
        aircraftFilter({ showAirborne: false }),
      ),
    ).toBe(false);
    expect(
      matchesAircraftFilter(
        aircraftPoint({ onGround: true }),
        aircraftFilter({ showGround: false }),
      ),
    ).toBe(false);
  });

  test("applies military and civilian roles", () => {
    expect(
      matchesAircraftFilter(
        aircraftPoint({ military: true }),
        aircraftFilter({ milFilter: MilFilter.Military }),
      ),
    ).toBe(true);
    expect(
      matchesAircraftFilter(
        aircraftPoint(),
        aircraftFilter({ milFilter: MilFilter.Military }),
      ),
    ).toBe(false);
    expect(
      matchesAircraftFilter(
        aircraftPoint({ military: true }),
        aircraftFilter({ milFilter: MilFilter.Civilian }),
      ),
    ).toBe(false);
    expect(
      matchesAircraftFilter(
        aircraftPoint(),
        aircraftFilter({ milFilter: MilFilter.Civilian }),
      ),
    ).toBe(true);
  });

  test("applies the recon role independently", () => {
    expect(
      matchesAircraftFilter(
        aircraftPoint({ recon: true }),
        aircraftFilter({ milFilter: MilFilter.Recon }),
      ),
    ).toBe(true);
    expect(
      matchesAircraftFilter(
        aircraftPoint({ military: true }),
        aircraftFilter({ milFilter: MilFilter.Recon }),
      ),
    ).toBe(false);
  });

  test("applies shared squawk buckets", () => {
    const emergencyFilter = aircraftFilter({
      squawks: [SquawkBucket.Emergency],
    });
    expect(
      matchesAircraftFilter(
        aircraftPoint({ squawk: SquawkCode.Emergency }),
        emergencyFilter,
      ),
    ).toBe(true);
    expect(
      matchesAircraftFilter(aircraftPoint(), emergencyFilter),
    ).toBe(false);
  });

  test("applies origin-country choices", () => {
    const countryFilter = aircraftFilter({
      countries: [AircraftFixtureText.UnitedStates],
    });
    expect(
      matchesAircraftFilter(aircraftPoint(), countryFilter),
    ).toBe(true);
    expect(
      matchesAircraftFilter(
        aircraftPoint({
          originCountry: AircraftFixtureText.UnitedKingdom,
        }),
        countryFilter,
      ),
    ).toBe(false);
  });
});
