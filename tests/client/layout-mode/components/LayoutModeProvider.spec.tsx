import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { LayoutModeProvider, useIsMobileLayout } from "@/layout-mode";
import { DomEvent } from "@/runtime";
import { flushReactUpdates, renderReact } from "../../../support/react";

enum RotationFixtureProperty {
  Height = "innerHeight",
  UserAgent = "userAgent",
  Width = "innerWidth",
}

enum RotationFixtureDimension {
  Long = 852,
  Short = 393,
}

enum RotationFixtureUserAgent {
  Phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1",
}

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

function LayoutProbe() {
  return <output>{String(useIsMobileLayout())}</output>;
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, RotationFixtureProperty.Width, {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, RotationFixtureProperty.Height, {
    configurable: true,
    value: height,
  });
}

beforeEach(() => {
  Object.defineProperty(navigator, RotationFixtureProperty.UserAgent, {
    configurable: true,
    value: RotationFixtureUserAgent.Phone,
  });
  setViewport(RotationFixtureDimension.Short, RotationFixtureDimension.Long);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, RotationFixtureProperty.UserAgent);
  setViewport(originalWidth, originalHeight);
});

describe("LayoutModeProvider rotation", () => {
  test("keeps the phone layout when a phone rotates to landscape", async () => {
    const { container } = renderReact(
      <LayoutModeProvider>
        <LayoutProbe />
      </LayoutModeProvider>,
    );
    await flushReactUpdates();

    setViewport(RotationFixtureDimension.Long, RotationFixtureDimension.Short);
    act(() => {
      window.dispatchEvent(new Event(DomEvent.Resize));
    });
    await flushReactUpdates();

    expect(container.textContent).toBe(String(true));
  });
});
