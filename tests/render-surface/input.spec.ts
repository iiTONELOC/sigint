import { describe, expect, test } from "bun:test";
import { DomEvent } from "@/runtime";
import {
  InputAdapter,
  SurfaceControlKey,
} from "@/render-surface/input";
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
}

type TouchPoint = Readonly<{ clientX: number; clientY: number }>;

function touchEvent(type: DomEvent, points: readonly TouchPoint[]): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "touches", {
    value: { length: points.length, item: (index: number) => points[index] ?? null },
  });
  return event;
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
