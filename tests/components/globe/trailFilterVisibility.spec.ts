// ── Trail filter visibility tests ────────────────────────────────────
// Validates that the trail drawing gate in pointWorker.js correctly
// hides trails when the selected item doesn't pass active filters.
//
// The worker is plain JS (no imports), so we replicate the gate logic
// here and test it in isolation. If the worker's gate logic changes,
// these tests must be updated in lockstep.

import { describe, test, expect } from "bun:test";

// ── Replicate matchesAF from pointWorker.js ──────────────────────────

function matchesAF(
  d: Record<string, unknown>,
  f: {
    enabled: boolean;
    showAirborne: boolean;
    showGround: boolean;
    milFilter: string;
    squawks: string[];
    countries: string[];
  },
): boolean {
  if (!f.enabled) return false;
  const onGround = d.onGround === true;
  if (!f.showAirborne && !onGround) return false;
  if (!f.showGround && onGround) return false;
  const mf = f.milFilter || "all";
  if (mf === "military" && !d.military) return false;
  if (mf === "civilian" && d.military) return false;
  if (f.squawks.length > 0) {
    const sq = (d.squawk as string) || "";
    const bucket =
      sq === "7700"
        ? "7700"
        : sq === "7600"
          ? "7600"
          : sq === "7500"
            ? "7500"
            : "other";
    if (f.squawks.indexOf(bucket) === -1) return false;
  }
  if (f.countries.length > 0) {
    if (f.countries.indexOf((d.originCountry as string) || "") === -1)
      return false;
  }
  return true;
}

// ── Replicate shouldDrawTrail gate from pointWorker.js ───────────────

type SelectedItem = {
  id: string;
  type: string;
  data?: Record<string, unknown>;
};

type TrailGateInput = {
  selectedItem: SelectedItem | null;
  searchSet: Set<string> | null;
  isoMode: string | null;
  isoId: string | null;
  isolatedType: string | null;
  layers: Record<string, boolean>;
  af: {
    enabled: boolean;
    showAirborne: boolean;
    showGround: boolean;
    milFilter: string;
    squawks: string[];
    countries: string[];
  };
  /** Full data array — worker looks up selected item here for .data */
  data: Array<{ id: string; type: string; data: Record<string, unknown> }>;
};

function shouldDrawTrail(input: TrailGateInput): boolean {
  const {
    selectedItem,
    searchSet,
    isoMode,
    isoId,
    isolatedType,
    layers,
    af,
    data,
  } = input;
  if (!selectedItem) return false;

  // Search filter
  if (searchSet && !searchSet.has(selectedItem.id)) return false;

  // Isolation modes
  if (isoMode === "solo" && selectedItem.id !== isoId) return false;
  if (isoMode === "focus" && isolatedType && selectedItem.type !== isolatedType)
    return false;

  // Layer/aircraft filter
  if (selectedItem.type === "aircraft") {
    let fullItem: { data: Record<string, unknown> } | null = null;
    for (let i = 0; i < data.length; i++) {
      if (data[i]!.id === selectedItem.id) {
        fullItem = data[i]!;
        break;
      }
    }
    if (!fullItem || !matchesAF(fullItem.data || {}, af)) return false;
  } else {
    if (layers[selectedItem.type] === false) return false;
  }

  return true;
}

// ── Helpers ──────────────────────────────────────────────────────────

const defaultAF = {
  enabled: true,
  showAirborne: true,
  showGround: true,
  milFilter: "all",
  squawks: [] as string[],
  countries: [] as string[],
};

const defaultLayers: Record<string, boolean> = {
  ships: true,
  events: true,
  quakes: true,
  fires: true,
  weather: true,
};

function makeAircraft(
  id: string,
  overrides: Record<string, unknown> = {},
): { id: string; type: string; data: Record<string, unknown> } {
  return {
    id,
    type: "aircraft",
    data: {
      squawk: "1200",
      onGround: false,
      military: false,
      originCountry: "United States",
      ...overrides,
    },
  };
}

function makeShip(id: string): {
  id: string;
  type: string;
  data: Record<string, unknown>;
} {
  return { id, type: "ships", data: { heading: 90 } };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("trail visibility gate", () => {
  test("trail shown when selected aircraft passes default filter", () => {
    const ac = makeAircraft("AC1");
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: defaultAF,
        data: [ac],
      }),
    ).toBe(true);
  });

  test("trail hidden when squawk filter excludes selected aircraft", () => {
    const ac = makeAircraft("AC1", { squawk: "1200" });
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: { ...defaultAF, squawks: ["7500"] },
        data: [ac],
      }),
    ).toBe(false);
  });

  test("trail hidden when squawk filter set to 7700 but aircraft has normal squawk", () => {
    const ac = makeAircraft("AC1", { squawk: "2562" });
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: { ...defaultAF, squawks: ["7700"] },
        data: [ac],
      }),
    ).toBe(false);
  });

  test("trail shown when squawk filter matches selected aircraft squawk", () => {
    const ac = makeAircraft("AC1", { squawk: "7500" });
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: { ...defaultAF, squawks: ["7500"] },
        data: [ac],
      }),
    ).toBe(true);
  });

  test("trail hidden when military filter excludes civilian aircraft", () => {
    const ac = makeAircraft("AC1", { military: false });
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: { ...defaultAF, milFilter: "military" },
        data: [ac],
      }),
    ).toBe(false);
  });

  test("trail hidden when civilian filter excludes military aircraft", () => {
    const ac = makeAircraft("AC1", { military: true });
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: { ...defaultAF, milFilter: "civilian" },
        data: [ac],
      }),
    ).toBe(false);
  });

  test("trail hidden when country filter excludes selected aircraft", () => {
    const ac = makeAircraft("AC1", { originCountry: "United States" });
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: { ...defaultAF, countries: ["Canada"] },
        data: [ac],
      }),
    ).toBe(false);
  });

  test("trail hidden when aircraft filter disabled entirely", () => {
    const ac = makeAircraft("AC1");
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: { ...defaultAF, enabled: false },
        data: [ac],
      }),
    ).toBe(false);
  });

  test("trail hidden when airborne filter off and aircraft airborne", () => {
    const ac = makeAircraft("AC1", { onGround: false });
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: { ...defaultAF, showAirborne: false },
        data: [ac],
      }),
    ).toBe(false);
  });

  test("trail hidden when ground filter off and aircraft on ground", () => {
    const ac = makeAircraft("AC1", { onGround: true });
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: { ...defaultAF, showGround: false },
        data: [ac],
      }),
    ).toBe(false);
  });

  test("trail hidden when ship layer disabled", () => {
    const ship = makeShip("S1");
    expect(
      shouldDrawTrail({
        selectedItem: { id: "S1", type: "ships" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: { ...defaultLayers, ships: false },
        af: defaultAF,
        data: [ship],
      }),
    ).toBe(false);
  });

  test("trail shown when ship layer enabled", () => {
    const ship = makeShip("S1");
    expect(
      shouldDrawTrail({
        selectedItem: { id: "S1", type: "ships" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: { ...defaultLayers, ships: true },
        af: defaultAF,
        data: [ship],
      }),
    ).toBe(true);
  });

  test("trail hidden when search filter excludes selected item", () => {
    const ac = makeAircraft("AC1");
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: new Set(["AC99"]),
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: defaultAF,
        data: [ac],
      }),
    ).toBe(false);
  });

  test("trail shown when search filter includes selected item", () => {
    const ac = makeAircraft("AC1");
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: new Set(["AC1", "AC2"]),
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: defaultAF,
        data: [ac],
      }),
    ).toBe(true);
  });

  test("trail hidden in SOLO mode when selected is not isolated item", () => {
    const ac = makeAircraft("AC1");
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: "solo",
        isoId: "AC99",
        isolatedType: null,
        layers: defaultLayers,
        af: defaultAF,
        data: [ac],
      }),
    ).toBe(false);
  });

  test("trail shown in SOLO mode when selected IS the isolated item", () => {
    const ac = makeAircraft("AC1");
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: "solo",
        isoId: "AC1",
        isolatedType: null,
        layers: defaultLayers,
        af: defaultAF,
        data: [ac],
      }),
    ).toBe(true);
  });

  test("trail hidden in FOCUS mode when selected type doesn't match isolated type", () => {
    const ship = makeShip("S1");
    expect(
      shouldDrawTrail({
        selectedItem: { id: "S1", type: "ships" },
        searchSet: null,
        isoMode: "focus",
        isoId: "AC1",
        isolatedType: "aircraft",
        layers: defaultLayers,
        af: defaultAF,
        data: [ship],
      }),
    ).toBe(false);
  });

  test("no trail when selectedItem is null", () => {
    expect(
      shouldDrawTrail({
        selectedItem: null,
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: defaultAF,
        data: [],
      }),
    ).toBe(false);
  });

  test("trail hidden when aircraft not found in data array", () => {
    // selectedItem exists but data array doesn't contain it
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: defaultAF,
        data: [], // empty — AC1 not present
      }),
    ).toBe(false);
  });

  test("combined: squawk filter + country filter both must pass", () => {
    const ac = makeAircraft("AC1", {
      squawk: "7700",
      originCountry: "Canada",
    });
    // Filter requires 7700 squawk AND United States — Canada should fail
    expect(
      shouldDrawTrail({
        selectedItem: { id: "AC1", type: "aircraft" },
        searchSet: null,
        isoMode: null,
        isoId: null,
        isolatedType: null,
        layers: defaultLayers,
        af: { ...defaultAF, squawks: ["7700"], countries: ["United States"] },
        data: [ac],
      }),
    ).toBe(false);
  });
});
