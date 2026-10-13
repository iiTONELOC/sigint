import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { act, type ReactElement } from "react";
import {
  DossierMiniGlobe,
  type DossierMiniGlobeCamera,
  type DossierMiniGlobeDrawContext,
} from "@/dossier";
import { ShipMiniMap } from "@/features/tracking/ships/ui/ShipMiniMap";
import { ThemeProvider } from "@/theme";
import { DomEvent } from "@/runtime";
import { CAMERA_POLICY } from "@/workers/render/policy";
import { renderReact, type ReactRenderResult } from "../../../support/react";
import { touchEvent, type TouchTestPoint } from "../../../support/touch";

enum MiniGlobeTestPoint {
  DragStart = 100,
  DragEnd = 160,
}

enum MiniGlobeTestPosition {
  Latitude = 10,
  Longitude = 20,
  MovedLatitude = 11,
}

enum MiniGlobeTestPointer {
  Id = 3,
}

enum MiniGlobeTestSelector {
  Canvas = "canvas",
  ZoomIn = "button[aria-label='Zoom in']",
}

enum MiniGlobeTestErrorMessage {
  CanvasMissing = "The mini globe canvas did not render.",
  ZoomMissing = "The mini globe zoom button did not render.",
}

const CAMERA: DossierMiniGlobeCamera = {
  centerLatitude: MiniGlobeTestPosition.Latitude,
  centerLongitude: MiniGlobeTestPosition.Longitude,
  maximumZoom: 8,
  minimumZoom: 0.5,
  radiusScale: 1,
  spanDegrees: 10,
};

const originalGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
let drawnRadii: number[][] = [];

function recordingContext(): CanvasRenderingContext2D {
  const target: Record<PropertyKey, unknown> = {
    arc: (_x: number, _y: number, radius: number) => {
      drawnRadii.at(-1)?.push(radius);
    },
    clearRect: () => {
      drawnRadii.push([]);
    },
  };
  return new Proxy(target, {
    get: (record, key) => (key in record ? record[key] : () => undefined),
    set: (record, key, value) => {
      record[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  drawnRadii = [];
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: recordingContext,
  });
});

afterEach(() => {
  if (originalGetContext) {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalGetContext);
  }
});

function themed(element: ReactElement): ReactElement {
  return <ThemeProvider>{element}</ThemeProvider>;
}

function requireElement(rendered: ReactRenderResult, selector: string, message: string): HTMLElement {
  const element = rendered.container.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new TypeError(message);
  return element;
}

function dispatchPointer(canvas: HTMLElement, type: DomEvent, clientX: number): void {
  act(() => {
    canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      clientX,
      clientY: MiniGlobeTestPoint.DragStart,
      pointerId: MiniGlobeTestPointer.Id,
    }));
  });
}

function lastGlobeRadius(): number {
  return Math.max(...(drawnRadii.at(-1) ?? []));
}

type MiniGlobeCenters = Readonly<{
  canvas: HTMLElement;
  centers: number[];
}>;

function renderCenters(): MiniGlobeCenters {
  const centers: number[] = [];
  const drawOverlay = ({ project }: DossierMiniGlobeDrawContext) => {
    centers.push(project(CAMERA.centerLatitude, CAMERA.centerLongitude).x);
  };
  const rendered = renderReact(
    themed(<DossierMiniGlobe ariaLabel="Test globe" camera={CAMERA} drawOverlay={drawOverlay} />),
  );
  return {
    canvas: requireElement(rendered, MiniGlobeTestSelector.Canvas, MiniGlobeTestErrorMessage.CanvasMissing),
    centers,
  };
}

function dispatchTouch(canvas: HTMLElement, type: DomEvent, point: TouchTestPoint): Event {
  const event = touchEvent(type, [point]);
  act(() => {
    canvas.dispatchEvent(event);
  });
  return event;
}

const TOUCH_START: TouchTestPoint = { clientX: MiniGlobeTestPoint.DragStart, clientY: MiniGlobeTestPoint.DragStart };
const SWIPE_DOWN: TouchTestPoint = { clientX: MiniGlobeTestPoint.DragStart, clientY: MiniGlobeTestPoint.DragEnd };
const DRAG_RIGHT: TouchTestPoint = { clientX: MiniGlobeTestPoint.DragEnd, clientY: MiniGlobeTestPoint.DragStart };

describe("DossierMiniGlobe touch", () => {
  test("leaves a one-finger swipe to the page", () => {
    const { canvas, centers } = renderCenters();
    const startCenter = centers.at(-1);

    dispatchTouch(canvas, DomEvent.TouchStart, TOUCH_START);
    const swipe = dispatchTouch(canvas, DomEvent.TouchMove, SWIPE_DOWN);
    dispatchTouch(canvas, DomEvent.TouchEnd, SWIPE_DOWN);

    expect(swipe.defaultPrevented).toBe(false);
    expect(centers.at(-1)).toBe(startCenter);
  });

  test("pans after a hold and keeps the page still", () => {
    jest.useFakeTimers();
    const { canvas, centers } = renderCenters();
    const startCenter = centers.at(-1);

    dispatchTouch(canvas, DomEvent.TouchStart, TOUCH_START);
    jest.advanceTimersByTime(CAMERA_POLICY.touchHoldMs);
    const drag = dispatchTouch(canvas, DomEvent.TouchMove, DRAG_RIGHT);
    dispatchTouch(canvas, DomEvent.TouchEnd, DRAG_RIGHT);
    jest.useRealTimers();

    expect(drag.defaultPrevented).toBe(true);
    expect(centers.at(-1)).not.toBe(startCenter);
  });
});

describe("DossierMiniGlobe", () => {
  test("keeps a drag when its parent renders during the drag", () => {
    const centers: number[] = [];
    const overlay = () => ({ project }: DossierMiniGlobeDrawContext) => {
      centers.push(project(CAMERA.centerLatitude, CAMERA.centerLongitude).x);
    };
    const globe = (drawOverlay: ReturnType<typeof overlay>) =>
      themed(<DossierMiniGlobe ariaLabel="Test globe" camera={CAMERA} drawOverlay={drawOverlay} />);
    const rendered = renderReact(globe(overlay()));
    const canvas = requireElement(rendered, MiniGlobeTestSelector.Canvas, MiniGlobeTestErrorMessage.CanvasMissing);
    const startCenter = centers.at(-1);

    dispatchPointer(canvas, DomEvent.PointerDown, MiniGlobeTestPoint.DragStart);
    rendered.rerender(globe(overlay()));
    dispatchPointer(canvas, DomEvent.PointerMove, MiniGlobeTestPoint.DragEnd);

    expect(centers.at(-1)).not.toBe(startCenter);
  });
});

describe("ShipMiniMap", () => {
  test("keeps the zoom when the vessel moves", () => {
    const ship = (latitude: number) =>
      themed(<ShipMiniMap lat={latitude} lon={MiniGlobeTestPosition.Longitude} trail={[]} />);
    const rendered = renderReact(ship(MiniGlobeTestPosition.Latitude));
    const zoomIn = requireElement(rendered, MiniGlobeTestSelector.ZoomIn, MiniGlobeTestErrorMessage.ZoomMissing);
    act(() => zoomIn.click());
    const zoomedRadius = lastGlobeRadius();

    rendered.rerender(ship(MiniGlobeTestPosition.MovedLatitude));

    expect(lastGlobeRadius()).toBe(zoomedRadius);
  });
});
