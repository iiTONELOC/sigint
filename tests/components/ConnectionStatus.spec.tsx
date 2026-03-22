import { describe, test, expect } from "bun:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ConnectionStatus } from "@/components/ConnectionStatus";

function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(ConnectionStatus));
  });
  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  return { container, unmount };
}

describe("ConnectionStatus", () => {
  test("renders nothing when online", () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });
    const { container, unmount } = render();
    expect(container.textContent).toBe("");
    unmount();
  });

  test("shows OFFLINE bar when offline", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });
    const { container, unmount } = render();
    expect(container.textContent).toContain("OFFLINE");
    expect(container.textContent).toContain("CACHED DATA ONLY");
    unmount();
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  test("offline bar has RETRY button", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });
    const { container, unmount } = render();
    expect(container.textContent).toContain("RETRY");
    const btn = container.querySelector("button");
    expect(btn).not.toBeNull();
    unmount();
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  test("offline bar has danger styling", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });
    const { container, unmount } = render();
    const bar = container.querySelector("[class*='bg-sig-danger']");
    expect(bar).not.toBeNull();
    unmount();
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  test("offline bar has pulse indicator", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });
    const { container, unmount } = render();
    const dot = container.querySelector(".animate-pulse");
    expect(dot).not.toBeNull();
    unmount();
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  test("shows RECONNECTED after offline → online transition", () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });
    const { container, unmount } = render();
    expect(container.textContent).toBe("");

    // Go offline first — sets wasOffline ref
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(container.textContent).toContain("OFFLINE");

    // Come back online — should show RECONNECTED
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(container.textContent).toContain("RECONNECTED");

    unmount();
  });
});
