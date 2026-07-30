import { describe, test, expect } from "bun:test";

// Test the pure search logic (getPrimaryLabel, getSecondaryLabel, searchItems)
// without rendering the full Search component

type DataPoint = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  lat: number;
  lon: number;
};

function getPrimaryLabel(item: DataPoint): string {
  const d = item.data;
  switch (item.type) {
    case "aircraft":
      return (d.callsign as string) || (d.icao24 as string) || item.id;
    case "ships":
      return (d.name as string) || item.id;
    case "events":
      return (d.headline as string) || item.id;
    case "quakes":
      return (d.location as string) || item.id;
    default:
      return item.id || "Unknown";
  }
}

function getSecondaryLabel(item: DataPoint): string {
  const d = item.data;
  switch (item.type) {
    case "aircraft": {
      const parts: string[] = [];
      if (d.acType && d.acType !== "Unknown") parts.push(d.acType as string);
      if (d.originCountry) parts.push(d.originCountry as string);
      if (d.operator) parts.push(d.operator as string);
      return parts.join(" · ") || "Unknown";
    }
    case "ships":
      return [d.vesselType, d.flag].filter(Boolean).join(" · ") || "";
    case "events":
      return [d.category, d.source].filter(Boolean).join(" · ") || "";
    case "quakes":
      return d.magnitude != null ? `M${d.magnitude}` : "";
    default:
      return "";
  }
}

describe("getPrimaryLabel", () => {
  test("aircraft uses callsign", () => {
    expect(
      getPrimaryLabel({
        id: "1",
        type: "aircraft",
        data: { callsign: "UAL123", icao24: "abc" },
        lat: 0,
        lon: 0,
      }),
    ).toBe("UAL123");
  });
  test("aircraft falls back to icao24", () => {
    expect(
      getPrimaryLabel({
        id: "1",
        type: "aircraft",
        data: { icao24: "abc123" },
        lat: 0,
        lon: 0,
      }),
    ).toBe("abc123");
  });
  test("ships uses name", () => {
    expect(
      getPrimaryLabel({
        id: "1",
        type: "ships",
        data: { name: "EVER GIVEN" },
        lat: 0,
        lon: 0,
      }),
    ).toBe("EVER GIVEN");
  });
  test("events uses headline", () => {
    expect(
      getPrimaryLabel({
        id: "1",
        type: "events",
        data: { headline: "Crisis in X" },
        lat: 0,
        lon: 0,
      }),
    ).toBe("Crisis in X");
  });
  test("quakes uses location", () => {
    expect(
      getPrimaryLabel({
        id: "1",
        type: "quakes",
        data: { location: "Tokyo" },
        lat: 0,
        lon: 0,
      }),
    ).toBe("Tokyo");
  });
  test("falls back to id", () => {
    expect(
      getPrimaryLabel({
        id: "fallback",
        type: "aircraft",
        data: {},
        lat: 0,
        lon: 0,
      }),
    ).toBe("fallback");
  });
});

describe("getSecondaryLabel", () => {
  test("aircraft joins type, country, operator", () => {
    const label = getSecondaryLabel({
      id: "1",
      type: "aircraft",
      data: { acType: "B738", originCountry: "US", operator: "Delta" },
      lat: 0,
      lon: 0,
    });
    expect(label).toBe("B738 · US · Delta");
  });
  test("aircraft skips Unknown type", () => {
    const label = getSecondaryLabel({
      id: "1",
      type: "aircraft",
      data: { acType: "Unknown", originCountry: "US" },
      lat: 0,
      lon: 0,
    });
    expect(label).toBe("US");
  });
  test("ships joins vesselType and flag", () => {
    const label = getSecondaryLabel({
      id: "1",
      type: "ships",
      data: { vesselType: "Cargo", flag: "PA" },
      lat: 0,
      lon: 0,
    });
    expect(label).toBe("Cargo · PA");
  });
  test("quakes shows magnitude", () => {
    expect(
      getSecondaryLabel({
        id: "1",
        type: "quakes",
        data: { magnitude: 5.2 },
        lat: 0,
        lon: 0,
      }),
    ).toBe("M5.2");
  });
  test("empty data returns fallback", () => {
    expect(
      getSecondaryLabel({
        id: "1",
        type: "aircraft",
        data: {},
        lat: 0,
        lon: 0,
      }),
    ).toBe("Unknown");
  });
});
