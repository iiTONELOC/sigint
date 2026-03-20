// ── Minimal renderHook for bun:test + happy-dom ─────────────────────
// No @testing-library/react dependency.

import React, { useState, act } from "react";
import { createRoot } from "react-dom/client";

type RenderHookResult<T> = {
  result: { current: T };
  waitFor: (pred: () => boolean, timeout?: number) => Promise<void>;
  unmount: () => void;
};

export function renderHook<T>(hookFn: () => T): RenderHookResult<T> {
  const result = { current: undefined as unknown as T };
  let rerender: () => void;

  function TestComponent() {
    result.current = hookFn();
    const [, setTick] = useState(0);
    rerender = () => setTick((t) => t + 1);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(TestComponent));
  });

  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  const waitFor = async (pred: () => boolean, timeout = 2000) => {
    const start = Date.now();
    while (!pred()) {
      if (Date.now() - start > timeout) {
        throw new Error(`waitFor timed out after ${timeout}ms`);
      }
      await new Promise((r) => setTimeout(r, 10));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  };

  return { result, waitFor, unmount };
}

export { act };
