import { describe, expect, test } from "bun:test";
import {
  createRenderSurfaceElementClass,
  type RenderSurfaceSessionFactory,
} from "@/render-surface/element";

enum ElementFixtureTag {
  Lifecycle = "test-sigint-render-surface",
  Move = "test-sigint-render-surface-move",
}

enum ElementFixtureCount {
  None = 0,
  Single = 1,
}

type ElementFixture = Readonly<{
  element: HTMLElement;
  startedCanvases: HTMLCanvasElement[];
  stops: () => number;
}>;

function mountElement(tagName: ElementFixtureTag): ElementFixture {
  const startedCanvases: HTMLCanvasElement[] = [];
  let stopCount = 0;
  const createSession: RenderSurfaceSessionFactory = () => ({
    start: (canvas) => {
      startedCanvases.push(canvas);
    },
    send: () => undefined,
    stop: () => {
      stopCount += 1;
    },
  });
  if (!customElements.get(tagName)) {
    customElements.define(
      tagName,
      createRenderSurfaceElementClass({ createSession }),
    );
  }
  const element = document.createElement(tagName);
  document.body.append(element);
  return { element, startedCanvases, stops: () => stopCount };
}

function requireCanvas(element: HTMLElement): HTMLCanvasElement {
  const canvas = element.shadowRoot?.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("The render surface did not create a canvas");
  }
  return canvas;
}

describe("render surface element", () => {
  test("creates the canvas and tears down after a real disconnect", async () => {
    const fixture = mountElement(ElementFixtureTag.Lifecycle);
    const canvas = requireCanvas(fixture.element);

    expect(fixture.startedCanvases).toEqual([canvas]);

    fixture.element.remove();
    expect(fixture.stops()).toBe(ElementFixtureCount.None);
    await Promise.resolve();
    expect(fixture.stops()).toBe(ElementFixtureCount.Single);
  });

  test("keeps the session through a same-task DOM move", async () => {
    const fixture = mountElement(ElementFixtureTag.Move);
    const canvas = requireCanvas(fixture.element);
    const nextParent = document.createElement("div");
    document.body.append(nextParent);

    nextParent.append(fixture.element);
    await Promise.resolve();

    expect(fixture.stops()).toBe(ElementFixtureCount.None);
    expect(requireCanvas(fixture.element)).toBe(canvas);
    expect(fixture.startedCanvases).toHaveLength(ElementFixtureCount.Single);

    fixture.element.remove();
    nextParent.remove();
    await Promise.resolve();
    expect(fixture.stops()).toBe(ElementFixtureCount.Single);
  });
});
