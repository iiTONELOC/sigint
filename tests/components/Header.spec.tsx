import { describe, expect, test } from "bun:test";
import { act } from "react";
import type { ComponentProps } from "react";
import { Header } from "@/components/Header";
import { MobileHeader } from "@/components/MobileHeader";
import { DataProvider } from "@/context/DataContext";
import { LayoutModeProvider } from "@/layout-mode";
import { ThemeProvider } from "@/theme";
import { MilFilter } from "@shared/domain/aircraft";
import { Domain } from "@shared/domain/identity";
import { SourceStatus } from "@shared/domain/sourceStatus";
import { renderReact } from "../support/react";

type HeaderProps = ComponentProps<typeof Header>;

enum HeaderFixtureSelector {
  AircraftFilter = "[data-tour='aircraft-filter'] button",
  LayerToggle = "button[aria-pressed]",
  LayerTogglesTarget = "[data-tour='layer-toggles']",
  LayoutMode = "[data-tour='layout-mode-toggle']",
  SheetToggles = "dialog [data-tour='layer-toggles']",
  SearchSlot = "[data-fixture-search]",
  SearchTarget = "[data-tour='search']",
}

function noop(): void {}

function headerProps(overrides: Partial<HeaderProps>): HeaderProps {
  return {
    aircraftFilter: {
      countries: [],
      enabled: true,
      milFilter: MilFilter.All,
      showAirborne: true,
      showGround: true,
      squawks: [],
    },
    availableCountries: ["US", "UK"],
    counts: {
      [Domain.Aircraft]: 42,
      [Domain.Events]: 5,
      [Domain.Ships]: 10,
    },
    dataSources: [
      {
        error: null,
        id: Domain.Aircraft,
        status: SourceStatus.Live,
      },
    ],
    layers: {
      [Domain.Aircraft]: true,
      [Domain.Events]: false,
      [Domain.Ships]: true,
    },
    setAircraftFilter: noop,
    toggleLayer: noop,
    ...overrides,
  };
}

function renderHeader(
  overrides: Partial<HeaderProps> = {},
): HTMLDivElement {
  return renderReact(
    <LayoutModeProvider>
      <ThemeProvider>
        <DataProvider>
          <Header {...headerProps(overrides)} />
        </DataProvider>
      </ThemeProvider>
    </LayoutModeProvider>,
  ).container;
}

type MobileHeaderProps = ComponentProps<typeof MobileHeader>;

function renderMobileHeader(overrides: Partial<MobileHeaderProps> = {}): HTMLDivElement {
  return renderReact(
    <LayoutModeProvider>
      <ThemeProvider>
        <DataProvider>
          <MobileHeader {...headerProps({})} {...overrides} />
        </DataProvider>
      </ThemeProvider>
    </LayoutModeProvider>,
  ).container;
}

describe("Header", () => {
  test("leaves the search tour target to the search slot", () => {
    const container = renderHeader({ searchSlot: <output data-fixture-search="" /> });

    expect(container.querySelector(HeaderFixtureSelector.SearchSlot)).not.toBeNull();
    expect(container.querySelector(HeaderFixtureSelector.SearchTarget)).toBeNull();
  });

  test("renders the SIGINT identity", () => {
    const container = renderHeader();

    expect(container.textContent).toContain("SIGINT");
  });

  test("offers the settings action", () => {
    const container = renderHeader();

    expect(
      container.querySelector('button[title="Settings"]'),
    ).not.toBeNull();
  });

  test("shows the current clock value", () => {
    const container = renderHeader();

    expect(container.textContent).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  test("names the layout-mode action", () => {
    const container = renderHeader();
    const layoutModeButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) =>
      button.getAttribute("aria-label")?.includes("Layout mode"),
    );

    expect(layoutModeButton).not.toBeUndefined();
  });
});

describe("MobileHeader", () => {
  test("makes the filters button the layer toggles tour target", () => {
    const container = renderMobileHeader();
    const target = container.querySelector(HeaderFixtureSelector.LayerTogglesTarget);

    expect(target instanceof HTMLButtonElement).toBe(true);
    expect(target?.textContent).toContain("FILTERS");
  });

  test("gives an open search the whole row", () => {
    const container = renderMobileHeader({ searchOpen: true, searchSlot: <output data-fixture-search="" /> });

    expect(container.querySelector(HeaderFixtureSelector.SearchSlot)).not.toBeNull();
    expect(container.textContent).not.toContain("SIGINT");
    expect(container.querySelector(HeaderFixtureSelector.LayerTogglesTarget)).toBeNull();
  });

  test("lays the sheet's layer chips out as a grid of equal cells with a worded layout toggle", () => {
    const container = renderMobileHeader();
    const filters = container.querySelector(HeaderFixtureSelector.LayerTogglesTarget);
    act(() => {
      if (filters instanceof HTMLButtonElement) filters.click();
    });
    const toggles = document.querySelector(HeaderFixtureSelector.SheetToggles);
    const chip = toggles?.querySelector(HeaderFixtureSelector.LayerToggle);
    const aircraft = toggles?.querySelector(HeaderFixtureSelector.AircraftFilter);
    const layoutMode = document.querySelector(`dialog ${HeaderFixtureSelector.LayoutMode}`);

    expect(toggles?.classList.contains("grid")).toBe(true);
    expect(chip?.classList.contains("w-full")).toBe(true);
    expect(aircraft?.classList.contains("w-full")).toBe(true);
    expect(layoutMode?.textContent).toContain("AUTO");
  });

  test("keeps the brand and the filters around a closed search", () => {
    const container = renderMobileHeader({ searchOpen: false, searchSlot: <output data-fixture-search="" /> });

    expect(container.querySelector(HeaderFixtureSelector.SearchSlot)).not.toBeNull();
    expect(container.textContent).toContain("SIGINT");
    expect(container.querySelector(HeaderFixtureSelector.LayerTogglesTarget)).not.toBeNull();
  });
});
