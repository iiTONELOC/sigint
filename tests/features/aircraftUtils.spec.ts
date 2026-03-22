import { describe, test, expect } from "bun:test";

type SquawkStatus = "emergency" | "radio_failure" | "hijack" | "normal";

function getSquawkStatus(squawk?: string): SquawkStatus {
  switch (squawk) {
    case "7700":
      return "emergency";
    case "7600":
      return "radio_failure";
    case "7500":
      return "hijack";
    default:
      return "normal";
  }
}
function getSquawkStatusLabel(status: SquawkStatus): string {
  switch (status) {
    case "emergency":
      return "EMERGENCY";
    case "radio_failure":
      return "RADIO FAILURE";
    case "hijack":
      return "HIJACK";
    default:
      return "NORMAL";
  }
}
function matchesAircraftFilter(item: any, f: any): boolean {
  if (!f.enabled) return false;
  const d = item.data;
  const onGround = d?.onGround === true;
  if (!f.showAirborne && !onGround) return false;
  if (!f.showGround && onGround) return false;
  if (f.milFilter === "military" && !d?.military) return false;
  if (f.milFilter === "civilian" && d?.military) return false;
  if (f.squawks.size > 0) {
    const sq = d?.squawk ?? "";
    const bucket =
      sq === "7700"
        ? "7700"
        : sq === "7600"
          ? "7600"
          : sq === "7500"
            ? "7500"
            : "other";
    if (!f.squawks.has(bucket)) return false;
  }
  if (f.countries.size > 0) {
    if (!f.countries.has(d?.originCountry ?? "")) return false;
  }
  return true;
}

describe("getSquawkStatus", () => {
  test("7700 → emergency", () => {
    expect(getSquawkStatus("7700")).toBe("emergency");
  });
  test("7600 → radio_failure", () => {
    expect(getSquawkStatus("7600")).toBe("radio_failure");
  });
  test("7500 → hijack", () => {
    expect(getSquawkStatus("7500")).toBe("hijack");
  });
  test("1200 → normal", () => {
    expect(getSquawkStatus("1200")).toBe("normal");
  });
  test("undefined → normal", () => {
    expect(getSquawkStatus()).toBe("normal");
  });
});

describe("getSquawkStatusLabel", () => {
  test("emergency", () => {
    expect(getSquawkStatusLabel("emergency")).toBe("EMERGENCY");
  });
  test("hijack", () => {
    expect(getSquawkStatusLabel("hijack")).toBe("HIJACK");
  });
  test("radio_failure", () => {
    expect(getSquawkStatusLabel("radio_failure")).toBe("RADIO FAILURE");
  });
  test("normal", () => {
    expect(getSquawkStatusLabel("normal")).toBe("NORMAL");
  });
});

describe("matchesAircraftFilter", () => {
  const base = {
    enabled: true,
    showAirborne: true,
    showGround: true,
    squawks: new Set(),
    countries: new Set(),
    milFilter: "all" as const,
  };
  const airborne = {
    data: { onGround: false, squawk: "1200", originCountry: "US" },
  };
  const ground = {
    data: { onGround: true, squawk: "1200", originCountry: "US" },
  };
  const emergency = {
    data: { onGround: false, squawk: "7700", originCountry: "US" },
  };
  const military = {
    data: {
      onGround: false,
      military: true,
      squawk: "1200",
      originCountry: "US",
    },
  };

  test("passes default filter", () => {
    expect(matchesAircraftFilter(airborne, base)).toBe(true);
  });
  test("disabled rejects all", () => {
    expect(matchesAircraftFilter(airborne, { ...base, enabled: false })).toBe(
      false,
    );
  });
  test("hide airborne", () => {
    expect(
      matchesAircraftFilter(airborne, { ...base, showAirborne: false }),
    ).toBe(false);
  });
  test("hide ground", () => {
    expect(matchesAircraftFilter(ground, { ...base, showGround: false })).toBe(
      false,
    );
  });
  test("mil only rejects civilian", () => {
    expect(
      matchesAircraftFilter(airborne, { ...base, milFilter: "military" }),
    ).toBe(false);
  });
  test("mil only accepts military", () => {
    expect(
      matchesAircraftFilter(military, { ...base, milFilter: "military" }),
    ).toBe(true);
  });
  test("civilian only rejects military", () => {
    expect(
      matchesAircraftFilter(military, { ...base, milFilter: "civilian" }),
    ).toBe(false);
  });
  test("squawk filter matches", () => {
    expect(
      matchesAircraftFilter(emergency, { ...base, squawks: new Set(["7700"]) }),
    ).toBe(true);
  });
  test("squawk filter rejects", () => {
    expect(
      matchesAircraftFilter(airborne, { ...base, squawks: new Set(["7700"]) }),
    ).toBe(false);
  });
  test("country filter matches", () => {
    expect(
      matchesAircraftFilter(airborne, { ...base, countries: new Set(["US"]) }),
    ).toBe(true);
  });
  test("country filter rejects", () => {
    expect(
      matchesAircraftFilter(airborne, { ...base, countries: new Set(["UK"]) }),
    ).toBe(false);
  });
});
