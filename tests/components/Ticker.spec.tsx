import { describe, test, expect } from "bun:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ThemeProvider } from "@/context/ThemeContext";
import { DataProvider } from "@/context/DataContext";
import { Ticker } from "@/components/Ticker";

const origFetch = globalThis.fetch;
//@ts-ignore
globalThis.fetch = async () =>
  ({ ok: true, status: 200, json: async () => ({}) }) as any;

function render(props: Record<string, any> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(
          DataProvider,
          null,
          React.createElement(Ticker, {
            items: props.items ?? [],
            ...props,
          }),
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

describe("Ticker", () => {
  test("renders without crash with empty data", () => {
    const { container, unmount } = render({ items: [] });
    expect(container.innerHTML.length).toBeGreaterThan(0);
    unmount();
  });

  test("renders ticker container", () => {
    const { container, unmount } = render();
    // Ticker renders a scrolling container
    expect(container.querySelector("div")).not.toBeNull();
    unmount();
  });
});

globalThis.fetch = origFetch;
