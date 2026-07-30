import { describe, expect, test } from "bun:test";
import {
  createRenderCommandSender,
  type RenderWorkerEndpoint,
} from "@/render-surface/session";
import {
  RenderMessageType,
  RenderProtocolVersion,
} from "@/workers/render/protocol";

describe("render surface session", () => {
  test("owns one increasing command sequence", () => {
    const messages: unknown[] = [];
    const endpoint: RenderWorkerEndpoint = {
      post: (message) => messages.push(message),
      subscribe: () => () => undefined,
      terminate: () => undefined,
    };
    const sender = createRenderCommandSender(endpoint, "session-a");

    sender.send({ type: RenderMessageType.Dispose });
    sender.send({
      type: RenderMessageType.Viewport,
      payload: { width: 800, height: 600, devicePixelRatio: 2 },
    });

    expect(messages).toEqual([
      {
        type: RenderMessageType.Dispose,
        protocolVersion: RenderProtocolVersion.Current,
        sessionId: "session-a",
        sequence: 1,
      },
      {
        type: RenderMessageType.Viewport,
        protocolVersion: RenderProtocolVersion.Current,
        sessionId: "session-a",
        sequence: 2,
        payload: { width: 800, height: 600, devicePixelRatio: 2 },
      },
    ]);
  });
});
