// ── Test setup — preloaded by bun before every test file ────────────
// Registers happy-dom globals (window, document, etc.) so react-dom
// client rendering works in tests. Also provides shared utilities.

import { GlobalRegistrator } from "@happy-dom/global-registrator";

// ── Dev-only fixture-override vars MUST be cleared in tests ─────────
// `resolveCyclonesFixtureOverride` and `resolveAircraftFixtureOverride`
// short-circuit the live HTTP path when these env vars are set. If a
// developer has them exported from their shell (e.g. inherited from a
// sourced .env), the cyclones/aircraft tests that mock `globalThis.fetch`
// fail silently — the fixture override fires before the mock is ever
// consulted, and assertions see fixture data instead of the queued
// canned responses. Clearing them here makes the test suite hermetic
// regardless of the developer's shell environment.
delete process.env.CYCLONES_FIXTURE;
delete process.env.AIRCRAFT_FIXTURE;

GlobalRegistrator.register();

// Suppress act() warnings in tests that don't wrap updates in act().
const originalError = console.error;
console.error = (...args: any[]) => {
  if (typeof args[0] === "string" && args[0].includes("not wrapped in act"))
    return;
  originalError(...args);
};

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
