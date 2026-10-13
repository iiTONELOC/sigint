import { describe, expect, jest, test } from "bun:test";
import { DomEvent } from "@/runtime";
import { touchEvent } from "../support/touch";
import {
  InputAdapter,
  SurfaceControlKey,
} from "@/render-surface/input";
import { CAMERA_POLICY } from "@/workers/render/policy";
import {
  RenderCameraKey,
  RenderInputKind,
  RenderInputPhase,
  type RenderInputPayload,
} from "@/workers/render/protocol";

enum TouchTestPoint {
  X = 20,
  Y = 30,
  ScrolledY = 90,
  SecondX = 120,
}

function phases(sent: readonly RenderInputPayload[]): (RenderInputPhase | null)[] {
  return sent.map((payload) => ("phase" in payload ? payload.phase : null));
}

describe("InputAdapter", () => {
  test("attaches pointer input and removes it on stop", () => {
    const canvas = document.createElement("canvas");
    const sent: RenderInputPayload[] = [];
    const adapter = new InputAdapter({
      canvas,
      sendInput: (payload) => sent.push(payload),
      onMiddleClick: () => undefined,
      scrollsPage: () => false,
    });

    adapter.start();
    canvas.dispatchEvent(new MouseEvent(DomEvent.MouseDown, {
      button: 0,
      clientX: 20,
      clientY: 30,
    }));
    window.dispatchEvent(new MouseEvent(DomEvent.MouseUp));

    expect(sent).toEqual([
      {
        kind: RenderInputKind.Pointer,
        phase: RenderInputPhase.Start,
        x: 20,
        y: 30,
      },
      {
        kind: RenderInputKind.Pointer,
        phase: RenderInputPhase.End,
        x: 20,
        y: 30,
      },
    ]);

    adapter.stop();
    canvas.dispatchEvent(new MouseEvent(DomEvent.MouseDown, {
      button: 0,
    }));
    expect(sent).toHaveLength(2);
  });

  test("hands a one-finger drag to the page and keeps a tap as a selection", () => {
    const canvas = document.createElement("canvas");
    const sent: RenderInputPayload[] = [];
    const adapter = new InputAdapter({
      canvas,
      sendInput: (payload) => sent.push(payload),
      onMiddleClick: () => undefined,
      scrollsPage: () => true,
    });
    const press = { clientX: TouchTestPoint.X, clientY: TouchTestPoint.Y };
    adapter.start();

    const tap = touchEvent(DomEvent.TouchStart, [press]);
    canvas.dispatchEvent(tap);
    canvas.dispatchEvent(touchEvent(DomEvent.TouchEnd, []));
    expect(tap.defaultPrevented).toBe(false);
    expect(phases(sent)).toEqual([RenderInputPhase.Start, RenderInputPhase.End]);

    sent.length = 0;
    canvas.dispatchEvent(touchEvent(DomEvent.TouchStart, [press]));
    canvas.dispatchEvent(touchEvent(DomEvent.TouchMove, [{ clientX: TouchTestPoint.X, clientY: TouchTestPoint.ScrolledY }]));
    expect(phases(sent)).toEqual([RenderInputPhase.Start, RenderInputPhase.Cancel]);

    adapter.stop();
  });

  test("moves the globe after a one-finger hold without selecting on release", () => {
    jest.useFakeTimers();
    const canvas = document.createElement("canvas");
    const sent: RenderInputPayload[] = [];
    const adapter = new InputAdapter({
      canvas,
      sendInput: (payload) => sent.push(payload),
      onMiddleClick: () => undefined,
      scrollsPage: () => true,
    });
    const press = { clientX: TouchTestPoint.X, clientY: TouchTestPoint.Y };
    const drag = touchEvent(DomEvent.TouchMove, [{ clientX: TouchTestPoint.X, clientY: TouchTestPoint.ScrolledY }]);
    adapter.start();

    canvas.dispatchEvent(touchEvent(DomEvent.TouchStart, [press]));
    jest.advanceTimersByTime(CAMERA_POLICY.touchHoldMs);
    canvas.dispatchEvent(drag);
    canvas.dispatchEvent(touchEvent(DomEvent.TouchEnd, []));
    expect(drag.defaultPrevented).toBe(true);
    expect(phases(sent)).toEqual([RenderInputPhase.Start, RenderInputPhase.Move, RenderInputPhase.Cancel]);

    sent.length = 0;
    canvas.dispatchEvent(touchEvent(DomEvent.TouchStart, [press]));
    jest.advanceTimersByTime(CAMERA_POLICY.touchHoldMs);
    canvas.dispatchEvent(touchEvent(DomEvent.TouchEnd, []));
    expect(phases(sent)).toEqual([RenderInputPhase.Start, RenderInputPhase.Cancel]);

    adapter.stop();
    jest.useRealTimers();
  });

  test("leaves a pinch to the page once the page scroll has started", () => {
    const canvas = document.createElement("canvas");
    const sent: RenderInputPayload[] = [];
    const adapter = new InputAdapter({
      canvas,
      sendInput: (payload) => sent.push(payload),
      onMiddleClick: () => undefined,
      scrollsPage: () => true,
    });
    const fingers = [
      { clientX: TouchTestPoint.X, clientY: TouchTestPoint.Y },
      { clientX: TouchTestPoint.SecondX, clientY: TouchTestPoint.Y },
    ];
    adapter.start();

    canvas.dispatchEvent(touchEvent(DomEvent.TouchStart, fingers));
    canvas.dispatchEvent(touchEvent(DomEvent.TouchMove, fingers, false));

    expect(sent.map((payload) => payload.kind)).toEqual([RenderInputKind.Pinch, RenderInputKind.Pointer]);
    expect(phases(sent)).toEqual([RenderInputPhase.Start, RenderInputPhase.Cancel]);

    adapter.stop();
  });

  test("maps keyboard commands without capturing text entry", () => {
    const canvas = document.createElement("canvas");
    const sent: RenderInputPayload[] = [];
    let middleClicks = 0;
    const adapter = new InputAdapter({
      canvas,
      sendInput: (payload) => sent.push(payload),
      onMiddleClick: () => {
        middleClicks += 1;
      },
      scrollsPage: () => false,
    });
    const input = document.createElement("input");
    document.body.append(input);

    adapter.start();
    input.dispatchEvent(new KeyboardEvent(DomEvent.KeyDown, {
      bubbles: true,
      code: RenderCameraKey.ArrowLeft,
    }));
    window.dispatchEvent(new KeyboardEvent(DomEvent.KeyDown, {
      code: RenderCameraKey.ArrowLeft,
    }));
    window.dispatchEvent(new KeyboardEvent(DomEvent.KeyDown, {
      code: SurfaceControlKey.MiddleClick,
    }));

    expect(sent).toEqual([
      {
        kind: RenderInputKind.Key,
        code: RenderCameraKey.ArrowLeft,
      },
    ]);
    expect(middleClicks).toBe(1);

    adapter.stop();
    input.remove();
  });
});
