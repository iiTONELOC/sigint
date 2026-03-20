/// <reference lib="dom" />
import { describe, test, expect } from "bun:test";
import { createRoot } from "react-dom/client";
import { createElement, act } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ── Helpers ─────────────────────────────────────────────────────────

function GoodChild() {
  return createElement("div", { "data-testid": "child" }, "healthy");
}

function BadChild(): never {
  throw new Error("component exploded");
}

function renderInto(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const prev = console.error;
  console.error = () => {};
  try {
    act(() => {
      root.render(element);
    });
  } catch {
    // Expected — error boundaries catch during render
  }
  console.error = prev;

  return container;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("ErrorBoundary", () => {
  test("renders children when no error", () => {
    const container = renderInto(
      createElement(ErrorBoundary, { name: "test" }, createElement(GoodChild)),
    );
    expect(container.innerHTML).toContain("healthy");
    expect(container.innerHTML).toContain('data-testid="child"');
  });

  test("catches error and renders default fallback", () => {
    const container = renderInto(
      createElement(
        ErrorBoundary,
        { name: "test-pane" },
        createElement(BadChild),
      ),
    );
    expect(container.innerHTML).toContain("TEST-PANE ERROR");
    expect(container.innerHTML).toContain("component exploded");
    expect(container.innerHTML).toContain("RETRY");
  });

  test("catches error and renders custom fallback", () => {
    const container = renderInto(
      createElement(
        ErrorBoundary,
        {
          name: "custom",
          fallback: (error: Error, _reset: () => void) =>
            createElement("div", null, `custom: ${error.message}`),
        },
        createElement(BadChild),
      ),
    );
    expect(container.innerHTML).toContain("custom: component exploded");
    expect(container.innerHTML).not.toContain("RETRY");
  });

  test("default fallback includes SIGINT theme classes", () => {
    const container = renderInto(
      createElement(ErrorBoundary, { name: "themed" }, createElement(BadChild)),
    );
    expect(container.innerHTML).toContain("text-sig-danger");
    expect(container.innerHTML).toContain("text-sig-accent");
    expect(container.innerHTML).toContain("bg-sig-bg");
  });

  test("name prop appears uppercased in default fallback", () => {
    const container = renderInto(
      createElement(
        ErrorBoundary,
        { name: "dossier" },
        createElement(BadChild),
      ),
    );
    expect(container.innerHTML).toContain("DOSSIER ERROR");
  });

  test("reset clears error and re-renders children", () => {
    let shouldThrow = true;

    function MaybeThrow() {
      if (shouldThrow) throw new Error("temporary failure");
      return createElement("div", null, "recovered");
    }

    const container = renderInto(
      createElement(
        ErrorBoundary,
        { name: "recover", autoRetryMs: 0 },
        createElement(MaybeThrow),
      ),
    );

    expect(container.innerHTML).toContain("RECOVER ERROR");

    shouldThrow = false;
    const retryBtn = container.querySelector("button");
    expect(retryBtn).not.toBeNull();

    const prev = console.error;
    console.error = () => {};
    try {
      act(() => {
        retryBtn!.click();
      });
    } catch {
      // Expected
    }
    console.error = prev;

    expect(container.innerHTML).toContain("recovered");
    expect(container.innerHTML).not.toContain("ERROR");
  });
});
