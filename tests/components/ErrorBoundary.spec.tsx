import { describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  renderReact,
  type ReactRenderResult,
  withExpectedReactError,
} from "../support/react";

function GoodChild() {
  return <div data-testid="child">healthy</div>;
}

function BadChild(): never {
  throw new Error("component exploded");
}

function renderBoundary(
  element: ReactElement,
  expectedError?: string,
): ReactRenderResult {
  return expectedError
    ? withExpectedReactError(expectedError, () => renderReact(element))
    : renderReact(element);
}

describe("ErrorBoundary", () => {
  test("renders children when no error occurs", () => {
    const { container } = renderBoundary(
      <ErrorBoundary name="test">
        <GoodChild />
      </ErrorBoundary>,
    );

    expect(
      container.querySelector('[data-testid="child"]')?.textContent,
    ).toBe("healthy");
  });

  test("renders the default fallback for a child error", () => {
    const { container } = renderBoundary(
      <ErrorBoundary name="test-pane">
        <BadChild />
      </ErrorBoundary>,
      "component exploded",
    );

    expect(container.textContent).toContain("TEST-PANE ERROR");
    expect(container.textContent).toContain("component exploded");
    expect(container.querySelector("button")?.textContent).toContain("RETRY");
  });

  test("renders a supplied fallback for a child error", () => {
    const { container } = renderBoundary(
      <ErrorBoundary
        name="custom"
        fallback={(error) => <div>{`custom: ${error.message}`}</div>}
      >
        <BadChild />
      </ErrorBoundary>,
      "component exploded",
    );

    expect(container.textContent).toContain("custom: component exploded");
    expect(container.textContent).not.toContain("RETRY");
  });

  test("includes the boundary name in the default fallback", () => {
    const { container } = renderBoundary(
      <ErrorBoundary name="dossier">
        <BadChild />
      </ErrorBoundary>,
      "component exploded",
    );

    expect(container.textContent).toContain("DOSSIER ERROR");
  });

  test("resets and renders recovered children", () => {
    let shouldThrow = true;

    function MaybeThrow() {
      if (shouldThrow) {
        throw new Error("temporary failure");
      }
      return <div>recovered</div>;
    }

    const { container } = renderBoundary(
      <ErrorBoundary name="recover" autoRetryMs={0}>
        <MaybeThrow />
      </ErrorBoundary>,
      "temporary failure",
    );

    expect(container.textContent).toContain("RECOVER ERROR");

    shouldThrow = false;
    act(() => {
      container.querySelector("button")?.click();
    });

    expect(container.textContent).toContain("recovered");
    expect(container.textContent).not.toContain("ERROR");
  });
});
