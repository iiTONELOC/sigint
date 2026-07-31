import { describe, expect, test } from "bun:test";
import {
  createRenderSurfaceElementClass,
  type RenderSurfaceSessionFactory,
} from "@/render-surface/element";

describe("render surface element", () => {
  test("creates and owns the canvas and session", () => {
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
    const ElementClass = createRenderSurfaceElementClass({ createSession });
    const tagName = "test-sigint-render-surface";

    if (!customElements.get(tagName)) {
      customElements.define(tagName, ElementClass);
    }

    const element = document.createElement(tagName);
    document.body.append(element);

    const canvas = element.shadowRoot?.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("The render surface did not create a canvas");
    }

    expect(startedCanvases).toEqual([canvas]);

    element.remove();
    expect(stopCount).toBe(1);
  });
});
