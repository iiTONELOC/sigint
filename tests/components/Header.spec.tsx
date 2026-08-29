import { describe, expect, test } from "bun:test";
import type { ComponentProps } from "react";
import { Header } from "@/components/Header";
import { DataProvider } from "@/context/DataContext";
import { LayoutModeProvider } from "@/layout-mode";
import { ThemeProvider } from "@/theme";
import { MilFilter } from "@shared/domain/aircraft";
import { Domain } from "@shared/domain/identity";
import { SourceStatus } from "@shared/domain/sourceStatus";
import { renderReact } from "../support/react";

type HeaderProps = ComponentProps<typeof Header>;

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

describe("Header", () => {
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
