import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import {
  MilFilter,
  SquawkBucket,
  SquawkCode,
  SquawkStatus,
} from "@shared/domain/aircraft";
import type { BasePoint } from "@/features/base/types";
import type {
  AircraftData,
  AircraftFilter,
} from "@/features/tracking/aircraft/types";
import {
  getSquawkStatus,
  getSquawkStatusLabel,
  matchesAircraftFilter,
  normalizeIcao24,
} from "@/features/tracking/aircraft/lib/utils";

enum AircraftFixtureCoordinate {
  Origin = 0,
}

enum AircraftFixtureText {
  Empty = "",
  IcaoLower = "abc123",
  IcaoQuoted = "'abc123'",
  IcaoShort = "abc",
  IcaoShortPadded = "000abc",
  IcaoSpaced = "  abc123  ",
  IcaoUpper = "ABC123",
  InvalidIcao = "xyz123",
  OtherSquawk = "1200",
  UnitedKingdom = "UK",
  UnitedStates = "US",
}

type AircraftPoint = BasePoint & Readonly<{
  data: AircraftData;
}>;

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
    lat: AircraftFixtureCoordinate.Origin,
    lon: AircraftFixtureCoordinate.Origin,
    type: Domain.Aircraft,
  };
}

function aircraftFilter(
  values: Partial<AircraftFilter> = {},
): AircraftFilter {
  return {
    countries: new Set(),
    enabled: true,
    milFilter: MilFilter.All,
    showAirborne: true,
    showGround: true,
    squawks: new Set(),
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
    expect(normalizeIcao24(AircraftFixtureText.IcaoShort)).toBe(
      AircraftFixtureText.IcaoShortPadded,
    );
  });

  test("rejects absent and invalid ICAO values", () => {
    expect(normalizeIcao24(AircraftFixtureText.Empty)).toBeNull();
    expect(normalizeIcao24(AircraftFixtureText.InvalidIcao)).toBeNull();
    expect(normalizeIcao24(undefined)).toBeNull();
  });
});

describe("aircraft squawk presentation", () => {
  test("classifies the three emergency codes", () => {
    expect(getSquawkStatus(SquawkCode.Emergency)).toBe(
      SquawkStatus.Emergency,
    );
    expect(getSquawkStatus(SquawkCode.RadioFailure)).toBe(
      SquawkStatus.RadioFailure,
    );
    expect(getSquawkStatus(SquawkCode.Hijack)).toBe(
      SquawkStatus.Hijack,
    );
  });

  test("classifies other and absent codes as normal", () => {
    expect(getSquawkStatus(AircraftFixtureText.OtherSquawk)).toBe(
      SquawkStatus.Normal,
    );
    expect(getSquawkStatus()).toBe(SquawkStatus.Normal);
  });

  test("resolves the current status labels", () => {
    expect(getSquawkStatusLabel(SquawkStatus.Emergency)).toBe("EMERGENCY");
    expect(getSquawkStatusLabel(SquawkStatus.RadioFailure)).toBe(
      "RADIO FAILURE",
    );
    expect(getSquawkStatusLabel(SquawkStatus.Hijack)).toBe("HIJACK");
    expect(getSquawkStatusLabel(SquawkStatus.Normal)).toBe("NORMAL");
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
      squawks: new Set([SquawkBucket.Emergency]),
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
      countries: new Set([AircraftFixtureText.UnitedStates]),
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
