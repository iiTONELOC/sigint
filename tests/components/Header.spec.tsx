import { describe, test, expect } from "bun:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ThemeProvider } from "@/context/ThemeContext";
import { DataProvider } from "@/context/DataContext";
import { Header } from "@/components/Header";

function render(props: Record<string, any> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const defaults = {
    layers: { aircraft: true, ships: true, events: false },
    toggleLayer: () => {},
    counts: { aircraft: 42, ships: 10, events: 5 },
    dataSources: [{ status: "live" }],
    aircraftFilter: {
      enabled: true,
      showAirborne: true,
      showGround: true,
      squawks: new Set(),
      countries: new Set(),
      milFilter: "all",
    },
    setAircraftFilter: () => {},
    availableCountries: ["US", "UK"],
    ...props,
  };
  act(() => {
    root.render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(
          DataProvider,
          null,
          React.createElement(Header, defaults as any),
        ),
      ),
    );
  });
  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  return { container, unmount };
}

// Mock fetch
const origFetch = globalThis.fetch;
// @ts-ignore
globalThis.fetch = async () =>
  ({ ok: true, status: 200, json: async () => ({}) }) as any;

describe("Header", () => {
  test("renders SIGINT branding", () => {
    const { container, unmount } = render();
    expect(container.textContent).toContain("SIGINT");
    unmount();
  });

  test("renders settings button", () => {
    const { container, unmount } = render();
    const btn = container.querySelector('button[title="Settings"]');
    expect(btn).not.toBeNull();
    unmount();
  });

  test("renders clock", () => {
    const { container, unmount } = render();
    // Clock shows time in HH:MM:SS format
    expect(container.textContent).toMatch(/\d{1,2}:\d{2}:\d{2}/);
    unmount();
  });
});

// Restore
globalThis.fetch = origFetch;
