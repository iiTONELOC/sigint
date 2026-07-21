import type { RenderInputPayload } from "@/workers/render/protocol";
import { CAMERA_POLICY } from "@/workers/render/policy";

export type InputRefs = Readonly<{
  canvas: HTMLCanvasElement;
  sendInput: (payload: RenderInputPayload) => void;
  onMiddleClick: () => void;
}>;

export type InputHandlers = Readonly<{
  onDown: (event: MouseEvent | TouchEvent) => void;
  onMove: (event: MouseEvent | TouchEvent) => void;
  onUp: (event: MouseEvent | TouchEvent) => void;
  onHover: (event: MouseEvent) => void;
  onWheel: (event: WheelEvent) => void;
  onTouchMove: (event: TouchEvent) => void;
  onContextMenu: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  dispose: () => void;
}>;

type PointerPayload = Extract<
  RenderInputPayload,
  { kind: "pointer" }
>;

type ClientPoint = Readonly<{
  clientX: number;
  clientY: number;
}>;

const CAMERA_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Equal",
  "NumpadAdd",
  "Minus",
  "NumpadSubtract",
]);

function firstTouch(event: TouchEvent): Touch | null {
  return event.touches.item(0);
}

function touchPair(
  event: TouchEvent,
): readonly [Touch, Touch] | null {
  const first = event.touches.item(0);
  const second = event.touches.item(1);
  return first && second ? [first, second] : null;
}

function relativePoint(
  canvas: HTMLCanvasElement,
  point: ClientPoint,
): Readonly<{ x: number; y: number }> {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: point.clientX - bounds.left,
    y: point.clientY - bounds.top,
  };
}

function pinchPayload(
  canvas: HTMLCanvasElement,
  event: TouchEvent,
  phase: "start" | "move",
): Extract<RenderInputPayload, { kind: "pinch" }> | null {
  const pair = touchPair(event);
  if (!pair) return null;
  const [first, second] = pair;
  const center = relativePoint(canvas, {
    clientX: (first.clientX + second.clientX) / 2,
    clientY: (first.clientY + second.clientY) / 2,
  });
  return {
    kind: "pinch",
    phase,
    centerX: center.x,
    centerY: center.y,
    distance: Math.hypot(
      second.clientX - first.clientX,
      second.clientY - first.clientY,
    ),
  };
}

export function createInputHandlers(refs: InputRefs): InputHandlers {
  const { canvas, sendInput, onMiddleClick } = refs;
  let active = false;
  let pinching = false;
  let lastTouchTime = 0;
  let lastPoint = { x: 0, y: 0 };
  let pendingPointer: PointerPayload | null = null;
  let pointerFrame = 0;

  const flushPointer = (): void => {
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    const pending = pendingPointer;
    pendingPointer = null;
    if (pending) sendInput(pending);
  };

  const queuePointer = (payload: PointerPayload): void => {
    pendingPointer = payload;
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(flushPointer);
  };

  const onDown = (event: MouseEvent | TouchEvent): void => {
    if ("touches" in event) {
      lastTouchTime = Date.now();
      event.preventDefault();
      const pinch = pinchPayload(canvas, event, "start");
      if (pinch) {
        flushPointer();
        pinching = true;
        active = false;
        sendInput(pinch);
        return;
      }
    } else {
      if (
        Date.now() - lastTouchTime <
        CAMERA_POLICY.syntheticMouseSuppressionMs
      ) {
        return;
      }
      if (event.button === 1) {
        event.preventDefault();
        onMiddleClick();
        return;
      }
      if (event.button !== 0) return;
    }

    const point =
      "touches" in event ? firstTouch(event) : event;
    if (!point) return;
    const relative = relativePoint(canvas, point);
    lastPoint = relative;
    active = true;
    flushPointer();
    sendInput({
      kind: "pointer",
      phase: "start",
      x: relative.x,
      y: relative.y,
    });
  };

  const onMove = (event: MouseEvent | TouchEvent): void => {
    if ("touches" in event) {
      const pinch = pinchPayload(canvas, event, "move");
      if (pinch) {
        if (!pinching) {
          pinching = true;
          active = false;
          sendInput({ ...pinch, phase: "start" });
        } else {
          sendInput(pinch);
        }
        return;
      }
    }
    if (!active) return;
    const point =
      "touches" in event ? firstTouch(event) : event;
    if (!point) return;
    const relative = relativePoint(canvas, point);
    lastPoint = relative;
    queuePointer({
      kind: "pointer",
      phase: "move",
      x: relative.x,
      y: relative.y,
    });
  };

  const onUp = (): void => {
    flushPointer();
    if (pinching) {
      pinching = false;
      sendInput({
        kind: "pinch",
        phase: "end",
        centerX: lastPoint.x,
        centerY: lastPoint.y,
        distance: 0,
      });
      return;
    }
    if (!active) return;
    active = false;
    sendInput({
      kind: "pointer",
      phase: "end",
      x: lastPoint.x,
      y: lastPoint.y,
    });
  };

  const onHover = (event: MouseEvent): void => {
    if (active || pinching) return;
    const relative = relativePoint(canvas, event);
    queuePointer({
      kind: "pointer",
      phase: "hover",
      x: relative.x,
      y: relative.y,
    });
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const relative = relativePoint(canvas, event);
    sendInput({
      kind: "wheel",
      x: relative.x,
      y: relative.y,
      deltaY: event.deltaY,
    });
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (event.touches.length >= 2 || active) {
      event.preventDefault();
    }
    onMove(event);
  };

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    active = false;
    pinching = false;
    flushPointer();
    sendInput({
      kind: "pointer",
      phase: "cancel",
      x: lastPoint.x,
      y: lastPoint.y,
    });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      ) {
        return;
      }
    }
    if (event.code === "Space") {
      event.preventDefault();
      onMiddleClick();
      return;
    }
    if (!CAMERA_KEYS.has(event.code)) return;
    event.preventDefault();
    sendInput({ kind: "key", code: event.code });
  };

  return {
    onDown,
    onMove,
    onUp,
    onHover,
    onWheel,
    onTouchMove,
    onContextMenu,
    onKeyDown,
    dispose: flushPointer,
  };
}

export function attachInputHandlers(
  canvas: HTMLCanvasElement,
  handlers: InputHandlers,
): void {
  canvas.addEventListener("mousedown", handlers.onDown);
  window.addEventListener("mousemove", handlers.onMove);
  window.addEventListener("mouseup", handlers.onUp);
  canvas.addEventListener("mousemove", handlers.onHover);
  canvas.addEventListener("wheel", handlers.onWheel, { passive: false });
  canvas.addEventListener("touchstart", handlers.onDown, { passive: false });
  canvas.addEventListener("touchmove", handlers.onTouchMove, {
    passive: false,
  });
  canvas.addEventListener("touchend", handlers.onUp);
  canvas.addEventListener("contextmenu", handlers.onContextMenu);
  window.addEventListener("keydown", handlers.onKeyDown);
}

export function detachInputHandlers(
  canvas: HTMLCanvasElement,
  handlers: InputHandlers,
): void {
  handlers.dispose();
  canvas.removeEventListener("mousedown", handlers.onDown);
  window.removeEventListener("mousemove", handlers.onMove);
  window.removeEventListener("mouseup", handlers.onUp);
  canvas.removeEventListener("mousemove", handlers.onHover);
  canvas.removeEventListener("wheel", handlers.onWheel);
  canvas.removeEventListener("touchstart", handlers.onDown);
  canvas.removeEventListener("touchmove", handlers.onTouchMove);
  canvas.removeEventListener("touchend", handlers.onUp);
  canvas.removeEventListener("contextmenu", handlers.onContextMenu);
  window.removeEventListener("keydown", handlers.onKeyDown);
}
