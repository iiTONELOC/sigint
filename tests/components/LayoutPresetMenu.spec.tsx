import { describe, test, expect } from "bun:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ThemeProvider } from "@/context/ThemeContext";
import { LayoutPresetMenu } from "@/panes/LayoutPresetMenu";

function render(presets: any[] = [], presetsLoaded = true) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const actions: string[] = [];
  act(() => {
    root.render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(LayoutPresetMenu, {
          presets,
          onLoad: () => actions.push("load"),
          onSave: (name: string) => actions.push(`save:${name}`),
          onUpdate: (idx: number) => actions.push(`update:${idx}`),
          onDelete: (idx: number) => actions.push(`delete:${idx}`),
          onClose: () => actions.push("close"),
          presetsLoaded,
        }),
      ),
    );
  });
  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  return { container, unmount, actions };
}

describe("LayoutPresetMenu", () => {
  test("renders LAYOUT PRESETS header", () => {
    const { container, unmount } = render();
    expect(container.textContent).toContain("LAYOUT PRESETS");
    unmount();
  });

  test("shows empty state when no presets", () => {
    const { container, unmount } = render([], true);
    expect(container.textContent).toContain("No saved presets");
    unmount();
  });

  test("renders preset names", () => {
    const presets = [
      {
        name: "Watch Mode",
        state: {
          root: { type: "leaf", id: "1", paneType: "globe" },
          minimized: [],
        },
      },
      {
        name: "Analysis",
        state: {
          root: { type: "leaf", id: "2", paneType: "data-table" },
          minimized: [],
        },
      },
    ];
    const { container, unmount } = render(presets);
    expect(container.textContent).toContain("Watch Mode");
    expect(container.textContent).toContain("Analysis");
    unmount();
  });

  test("has save input", () => {
    const { container, unmount } = render();
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    unmount();
  });
});
