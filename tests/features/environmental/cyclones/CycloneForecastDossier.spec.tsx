import { describe, test, expect } from "bun:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import type { CycloneForecastPointData } from "@/features/environmental/cyclones/types";
import { CycloneForecastDossier } from "@/features/environmental/cyclones/ui/CycloneForecastDossier";

// ── Realistic forecast-point fixture ─────────────────────────────
// Mirrors what synthesizeForecastPoints emits for a +48h forecast
// point of an HU3 storm. Keeps the test self-contained — no real
// cyclone import needed.

const fixtureItem: DataPoint & {
  type: "cyclones-forecast";
  data: CycloneForecastPointData;
} = {
  id: "CYFAL052026-H48",
  type: "cyclones-forecast",
  lat: 28.4,
  lon: -78.1,
  timestamp: "2026-10-10T18:00:00Z",
  data: {
    parentStormId: "AL052026",
    parentName: "ELENA",
    parentBasin: "AL",
    fcstHour: 48,
    validTime: "2026-10-10T18:00:00Z",
    maxWindKt: 110,
    minPressureMb: 945,
    category: "HU3",
    saffirSimpson: 5,
    errorRadiusNm: 70,
  },
};

type Calls = {
  jumpedTo: string[];
  closed: number;
  located: number;
  focused: number;
  soloed: number;
};

function render(overrides: Partial<Parameters<typeof CycloneForecastDossier>[0]> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const calls: Calls = {
    jumpedTo: [],
    closed: 0,
    located: 0,
    focused: 0,
    soloed: 0,
  };
  const props = {
    item: fixtureItem,
    isolateMode: null,
    onLocate: () => {
      calls.located++;
    },
    onFocus: () => {
      calls.focused++;
    },
    onSolo: () => {
      calls.soloed++;
    },
    onClose: () => {
      calls.closed++;
    },
    onJumpToStorm: (id: string) => {
      calls.jumpedTo.push(id);
    },
    ...overrides,
  } as Parameters<typeof CycloneForecastDossier>[0];

  act(() => {
    root.render(React.createElement(CycloneForecastDossier, props));
  });

  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  return { container, unmount, calls };
}

// ── Section rendering ─────────────────────────────────────────────

describe("CycloneForecastDossier — sections render", () => {
  test("toolbar shows parent name and +Nh badge", () => {
    const { container, unmount } = render();
    expect(container.textContent).toContain("ELENA");
    expect(container.textContent).toContain("+48h");
    unmount();
  });

  test("IDENTITY section: storm name, basin, fcstHour, validTime present", () => {
    const { container, unmount } = render();
    const text = container.textContent ?? "";
    expect(text).toContain("ELENA");
    expect(text).toContain("AL052026");
    expect(text).toContain("AL");
    expect(text).toContain("+48h");
    unmount();
  });

  test("INTENSITY section: kt + mph + pressure + class", () => {
    const { container, unmount } = render();
    const text = container.textContent ?? "";
    expect(text).toContain("110 kn");
    // 110 * 1.15078 ≈ 127 mph
    expect(text).toContain("127 mph");
    expect(text).toContain("945 mb");
    expect(text).toContain("Hurricane Cat 3");
    unmount();
  });

  test("POSITION section formats lat/lon with hemispheres", () => {
    const { container, unmount } = render();
    const text = container.textContent ?? "";
    expect(text).toContain("28.400°N");
    expect(text).toContain("78.100°W");
    unmount();
  });

  test("UNCERTAINTY section: nm + km", () => {
    const { container, unmount } = render();
    const text = container.textContent ?? "";
    expect(text).toContain("70 nm");
    // 70 * 1.852 ≈ 130 km
    expect(text).toContain("130 km");
    unmount();
  });

  test("PARENT STORM section: JUMP TO STORM button is present and accessible", () => {
    const { container, unmount } = render();
    const btn = container.querySelector(
      "button[aria-label*='parent storm ELENA']",
    );
    expect(btn).not.toBeNull();
    expect((btn as HTMLButtonElement).textContent).toContain("JUMP TO STORM");
    unmount();
  });
});

// ── Interaction ───────────────────────────────────────────────────

describe("CycloneForecastDossier — interactions", () => {
  test("clicking JUMP TO STORM fires onJumpToStorm with the parentStormId", () => {
    const { container, unmount, calls } = render();
    const btn = container.querySelector(
      "button[aria-label*='parent storm']",
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    act(() => {
      btn!.click();
    });
    expect(calls.jumpedTo).toEqual(["AL052026"]);
    unmount();
  });

  test("close button still fires onClose (DossierToolbar wiring)", () => {
    const { container, unmount, calls } = render();
    const closeBtn = container.querySelector(
      "button[aria-label='Close dossier']",
    ) as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();
    act(() => {
      closeBtn!.click();
    });
    expect(calls.closed).toBe(1);
    unmount();
  });
});

// ── Edge cases ────────────────────────────────────────────────────

describe("CycloneForecastDossier — edge cases", () => {
  test("forecast point without minPressureMb hides the pressure row", () => {
    const noPressure = {
      ...fixtureItem,
      data: { ...fixtureItem.data, minPressureMb: undefined },
    };
    const { container, unmount } = render({ item: noPressure });
    expect(container.textContent).not.toContain("PRESSURE");
    unmount();
  });

  test("renders even with a non-standard category code (passes through)", () => {
    const odd = {
      ...fixtureItem,
      data: { ...fixtureItem.data, category: "PT" as const },
    };
    const { container, unmount } = render({ item: odd });
    expect(container.textContent).toContain("Post-Tropical");
    unmount();
  });
});
