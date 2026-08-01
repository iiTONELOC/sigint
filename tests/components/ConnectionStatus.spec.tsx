import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { renderReact } from "../support/react";

function setNavigatorOnline(online: boolean): void {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: online,
    writable: true,
  });
}

function renderConnectionStatus(): HTMLDivElement {
  return renderReact(<ConnectionStatus />).container;
}

afterEach(() => {
  setNavigatorOnline(true);
});

describe("ConnectionStatus", () => {
  test("renders nothing while online", () => {
    setNavigatorOnline(true);

    const container = renderConnectionStatus();

    expect(container.textContent).toBe("");
  });

  test("reports offline cached-data mode", () => {
    setNavigatorOnline(false);

    const container = renderConnectionStatus();

    expect(container.textContent).toContain("OFFLINE");
    expect(container.textContent).toContain("CACHED DATA ONLY");
  });

  test("offers an offline retry action", () => {
    setNavigatorOnline(false);

    const container = renderConnectionStatus();
    const retryButton = container.querySelector("button");

    expect(retryButton?.textContent).toContain("RETRY");
  });

  test("reports a restored connection", () => {
    setNavigatorOnline(true);
    const container = renderConnectionStatus();

    setNavigatorOnline(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(container.textContent).toContain("OFFLINE");

    setNavigatorOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(container.textContent).toContain("RECONNECTED");
  });
});
