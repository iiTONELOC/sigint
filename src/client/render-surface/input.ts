import {
  RenderCameraKey,
  RenderInputKind,
  RenderInputPhase,
  type RenderInputPayload,
} from "@/workers/render/protocol";
import { CAMERA_POLICY } from "@/workers/render/policy";
import { DomEvent } from "@/runtime";
import { isEnumValue } from "@shared/types/enum";

enum TextEntryElementTag {
  Input = "INPUT",
  Select = "SELECT",
  TextArea = "TEXTAREA",
}

export enum SurfaceControlKey {
  MiddleClick = "Space",
}

export const SURFACE_TOUCH_MODE_ATTRIBUTE = "data-touch-mode";

export enum SurfaceTouchMode {
  Globe = "globe",
  PageScroll = "page-scroll",
}

export enum CanvasTouchAction {
  None = "none",
  PanY = "pan-y",
}

export function scrollsPageOnTouch(host: Element): boolean {
  return host.getAttribute(SURFACE_TOUCH_MODE_ATTRIBUTE) === SurfaceTouchMode.PageScroll;
}

export function canvasTouchAction(host: Element): CanvasTouchAction {
  return scrollsPageOnTouch(host) ? CanvasTouchAction.PanY : CanvasTouchAction.None;
}

export type InputAdapterOptions = Readonly<{
  canvas: HTMLCanvasElement;
  sendInput: (payload: RenderInputPayload) => void;
  onMiddleClick: () => void;
  scrollsPage: () => boolean;
}>;

type PointerPayload = Extract<
  RenderInputPayload,
  { kind: RenderInputKind.Pointer }
>;

type ClientPoint = Readonly<{
  clientX: number;
  clientY: number;
}>;

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
  phase: RenderInputPhase.Start | RenderInputPhase.Move,
): Extract<
  RenderInputPayload,
  { kind: RenderInputKind.Pinch }
> | null {
  const pair = touchPair(event);
  if (!pair) return null;
  const [first, second] = pair;
  const center = relativePoint(canvas, {
    clientX: (first.clientX + second.clientX) / 2,
    clientY: (first.clientY + second.clientY) / 2,
  });
  return {
    kind: RenderInputKind.Pinch,
    phase,
    centerX: center.x,
    centerY: center.y,
    distance: Math.hypot(
      second.clientX - first.clientX,
      second.clientY - first.clientY,
    ),
  };
}

export class InputAdapter {
  private active = false;
  private pinching = false;
  private lastTouchTime = 0;
  private lastPoint = { x: 0, y: 0 };
  private pressPoint = { x: 0, y: 0 };
  private pendingPointer: PointerPayload | null = null;
  private pointerFrame = 0;
  private started = false;

  constructor(
    private readonly options: InputAdapterOptions,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    const canvas = this.options.canvas;
    canvas.addEventListener(DomEvent.MouseDown, this.onDown);
    window.addEventListener(DomEvent.MouseMove, this.onMove);
    window.addEventListener(DomEvent.MouseUp, this.onUp);
    canvas.addEventListener(DomEvent.MouseMove, this.onHover);
    canvas.addEventListener(DomEvent.Wheel, this.onWheel, {
      passive: false,
    });
    canvas.addEventListener(DomEvent.TouchStart, this.onDown, {
      passive: false,
    });
    canvas.addEventListener(DomEvent.TouchMove, this.onTouchMove, {
      passive: false,
    });
    canvas.addEventListener(DomEvent.TouchEnd, this.onUp);
    canvas.addEventListener(DomEvent.TouchCancel, this.cancelPointer);
    canvas.addEventListener(DomEvent.ContextMenu, this.onContextMenu);
    window.addEventListener(DomEvent.KeyDown, this.onKeyDown);
  }

  stop(): void {
    if (!this.started) return;
    this.flushPointer();
    const canvas = this.options.canvas;
    canvas.removeEventListener(DomEvent.MouseDown, this.onDown);
    window.removeEventListener(DomEvent.MouseMove, this.onMove);
    window.removeEventListener(DomEvent.MouseUp, this.onUp);
    canvas.removeEventListener(DomEvent.MouseMove, this.onHover);
    canvas.removeEventListener(DomEvent.Wheel, this.onWheel);
    canvas.removeEventListener(DomEvent.TouchStart, this.onDown);
    canvas.removeEventListener(DomEvent.TouchMove, this.onTouchMove);
    canvas.removeEventListener(DomEvent.TouchEnd, this.onUp);
    canvas.removeEventListener(DomEvent.TouchCancel, this.cancelPointer);
    canvas.removeEventListener(
      DomEvent.ContextMenu,
      this.onContextMenu,
    );
    window.removeEventListener(DomEvent.KeyDown, this.onKeyDown);
    this.active = false;
    this.pinching = false;
    this.started = false;
  }

  private readonly flushPointer = (): void => {
    if (this.pointerFrame) cancelAnimationFrame(this.pointerFrame);
    this.pointerFrame = 0;
    const pending = this.pendingPointer;
    this.pendingPointer = null;
    if (pending) this.options.sendInput(pending);
  };

  private queuePointer(payload: PointerPayload): void {
    this.pendingPointer = payload;
    if (this.pointerFrame) return;
    this.pointerFrame = requestAnimationFrame(this.flushPointer);
  }

  private readonly onDown = (
    event: MouseEvent | TouchEvent,
  ): void => {
    if ("touches" in event) {
      this.lastTouchTime = Date.now();
      if (event.touches.length > 1 || !this.options.scrollsPage()) event.preventDefault();
      const pinch = pinchPayload(
        this.options.canvas,
        event,
        RenderInputPhase.Start,
      );
      if (pinch) {
        this.flushPointer();
        this.pinching = true;
        this.active = false;
        this.options.sendInput(pinch);
        return;
      }
    } else {
      if (
        Date.now() - this.lastTouchTime <
        CAMERA_POLICY.syntheticMouseSuppressionMs
      ) {
        return;
      }
      if (event.button === 1) {
        event.preventDefault();
        this.options.onMiddleClick();
        return;
      }
      if (event.button !== 0) return;
    }

    const point =
      "touches" in event ? firstTouch(event) : event;
    if (!point) return;
    const relative = relativePoint(this.options.canvas, point);
    this.lastPoint = relative;
    this.pressPoint = relative;
    this.active = true;
    this.flushPointer();
    this.options.sendInput({
      kind: RenderInputKind.Pointer,
      phase: RenderInputPhase.Start,
      x: relative.x,
      y: relative.y,
    });
  };

  private readonly onMove = (
    event: MouseEvent | TouchEvent,
  ): void => {
    if ("touches" in event) {
      const pinch = pinchPayload(
        this.options.canvas,
        event,
        RenderInputPhase.Move,
      );
      if (pinch) {
        if (!this.pinching) {
          this.pinching = true;
          this.active = false;
          this.options.sendInput({
            ...pinch,
            phase: RenderInputPhase.Start,
          });
        } else {
          this.options.sendInput(pinch);
        }
        return;
      }
    }
    if (!this.active) return;
    const point =
      "touches" in event ? firstTouch(event) : event;
    if (!point) return;
    const relative = relativePoint(this.options.canvas, point);
    this.lastPoint = relative;
    this.queuePointer({
      kind: RenderInputKind.Pointer,
      phase: RenderInputPhase.Move,
      x: relative.x,
      y: relative.y,
    });
  };

  private readonly onUp = (): void => {
    this.flushPointer();
    if (this.pinching) {
      this.pinching = false;
      this.options.sendInput({
        kind: RenderInputKind.Pinch,
        phase: RenderInputPhase.End,
        centerX: this.lastPoint.x,
        centerY: this.lastPoint.y,
        distance: 0,
      });
      return;
    }
    if (!this.active) return;
    this.active = false;
    this.options.sendInput({
      kind: RenderInputKind.Pointer,
      phase: RenderInputPhase.End,
      x: this.lastPoint.x,
      y: this.lastPoint.y,
    });
  };

  private readonly onHover = (event: MouseEvent): void => {
    if (this.active || this.pinching) return;
    const relative = relativePoint(this.options.canvas, event);
    this.queuePointer({
      kind: RenderInputKind.Pointer,
      phase: RenderInputPhase.Hover,
      x: relative.x,
      y: relative.y,
    });
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const relative = relativePoint(this.options.canvas, event);
    this.options.sendInput({
      kind: RenderInputKind.Wheel,
      x: relative.x,
      y: relative.y,
      deltaY: event.deltaY,
    });
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (event.touches.length < 2 && this.options.scrollsPage()) {
      this.releaseToPage(event);
      return;
    }
    if (event.touches.length >= 2 || this.active) {
      event.preventDefault();
    }
    this.onMove(event);
  };

  private releaseToPage(event: TouchEvent): void {
    const point = firstTouch(event);
    if (!this.active || !point) return;
    const relative = relativePoint(this.options.canvas, point);
    const travelled = Math.hypot(relative.x - this.pressPoint.x, relative.y - this.pressPoint.y);
    if (travelled > CAMERA_POLICY.dragClickThresholdPx) this.cancelPointer();
  }

  private readonly cancelPointer = (): void => {
    this.active = false;
    this.pinching = false;
    this.flushPointer();
    this.options.sendInput({
      kind: RenderInputKind.Pointer,
      phase: RenderInputPhase.Cancel,
      x: this.lastPoint.x,
      y: this.lastPoint.y,
    });
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    this.cancelPointer();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (
        tag === TextEntryElementTag.Input ||
        tag === TextEntryElementTag.TextArea ||
        tag === TextEntryElementTag.Select
      ) {
        return;
      }
    }
    if (event.code === SurfaceControlKey.MiddleClick) {
      event.preventDefault();
      this.options.onMiddleClick();
      return;
    }
    if (!isEnumValue(event.code, RenderCameraKey)) return;
    event.preventDefault();
    this.options.sendInput({
      kind: RenderInputKind.Key,
      code: event.code,
    });
  };
}
