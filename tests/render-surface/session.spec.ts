import { describe, expect, test } from "bun:test";
import {
  createRenderCommandSender,
  type RenderWorkerEndpoint,
} from "@/render-surface/session";

describe("render surface session", () => {
  test("owns one increasing command sequence", () => {
    const messages: unknown[] = [];
    const endpoint: RenderWorkerEndpoint = {
      post: (message) => messages.push(message),
      subscribe: () => () => undefined,
      terminate: () => undefined,
    };
    const sender = createRenderCommandSender(endpoint, "session-a");

    sender.send({ type: "dispose" });
    sender.send({
      type: "viewport",
      payload: { width: 800, height: 600, devicePixelRatio: 2 },
    });

    expect(messages).toEqual([
      {
        type: "dispose",
        protocolVersion: 2,
        sessionId: "session-a",
        sequence: 1,
      },
      {
        type: "viewport",
        protocolVersion: 2,
        sessionId: "session-a",
        sequence: 2,
        payload: { width: 800, height: 600, devicePixelRatio: 2 },
      },
    ]);
  });
});
