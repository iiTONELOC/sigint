import { describe, test, expect } from "bun:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ResizeHandle } from "@/panes/ResizeHandle";

function render(direction: "h" | "v" = "h") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const calls: Array<{ splitId: string; ratio: number }> = [];
  act(() => {
    root.render(
      React.createElement(ResizeHandle, {
        splitId: "test-split",
        direction,
        onResize: (id: string, ratio: number) =>
          calls.push({ splitId: id, ratio }),
      }),
    );
  });
  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  return { container, unmount, calls };
}

describe("ResizeHandle", () => {
  test("renders horizontal handle", () => {
    const { container, unmount } = render("h");
    const handle = container.querySelector(".cursor-col-resize");
    expect(handle).not.toBeNull();
    unmount();
  });

  test("renders vertical handle", () => {
    const { container, unmount } = render("v");
    const handle = container.querySelector(".cursor-row-resize");
    expect(handle).not.toBeNull();
    unmount();
  });

  test("renders three grip dots", () => {
    const { container, unmount } = render();
    const dots = container.querySelectorAll(".rounded-full");
    expect(dots.length).toBe(3);
    unmount();
  });

  test("has touch target overlay", () => {
    const { container, unmount } = render();
    const overlay = container.querySelector(".touch-none");
    expect(overlay).not.toBeNull();
    unmount();
  });
});
