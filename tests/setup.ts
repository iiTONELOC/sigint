// ── Test setup — preloaded by bun before every test file ────────────
// Registers happy-dom globals (window, document, etc.) so react-dom
// client rendering works in tests. Also provides shared utilities.

import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// Tell React we're in a test environment — suppresses act() warnings
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── Shared utilities ────────────────────────────────────────────────

import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { type ReactElement } from "react";
import { afterEach } from "bun:test";

/**
 * Render a React element to an HTML string (SSR — no DOM needed).
 */
export function renderHTML(element: ReactElement): string {
  return renderToString(element);
}

/**
 * Render a React element into a real DOM container via createRoot.
 * Returns the container div. Call cleanup() or use afterEach.
 */
export function renderDOM(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(element);
  // Flush synchronously — happy-dom processes microtasks
  root.unmount();
  root.render(element);
  return container;
}

// Clean up DOM after each test
afterEach(() => {
  document.body.innerHTML = "";
});
