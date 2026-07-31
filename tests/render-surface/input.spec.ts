import { describe, expect, test } from "bun:test";
import { DomEvent } from "@/lib/runtime/domEvent";
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

describe("InputAdapter", () => {
  test("attaches pointer input and removes it on stop", () => {
    const canvas = document.createElement("canvas");
    const sent: RenderInputPayload[] = [];
    const adapter = new InputAdapter({
      canvas,
      sendInput: (payload) => sent.push(payload),
      onMiddleClick: () => undefined,
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
