import { describe, expect, test } from "bun:test";
import {
  RenderSurfaceSession,
  createRenderCommandSender,
  createRenderSurfaceSession,
  type RenderWorkerEndpoint,
} from "@/render-surface/session";
import {
  RenderMessageType,
  RenderProtocolVersion,
} from "@/workers/render/protocol";
import { Domain } from "@shared/domain/identity";

describe("render surface session", () => {
  test("constructs the lifecycle owner as one session class", () => {
    const session = createRenderSurfaceSession();

    expect(session).toBeInstanceOf(RenderSurfaceSession);
    session.stop();
  });

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
    sender.send({
      type: RenderMessageType.Selection,
      payload: {
        source: Domain.Aircraft,
        entityId: "aircraft-a",
        interactionId: "aircraft-a",
        pointType: Domain.Aircraft,
      },
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
      {
        type: RenderMessageType.Selection,
        protocolVersion: RenderProtocolVersion.Current,
        sessionId: "session-a",
        sequence: 3,
        payload: {
          source: Domain.Aircraft,
          entityId: "aircraft-a",
          interactionId: "aircraft-a",
          pointType: Domain.Aircraft,
        },
      },
    ]);
  });
});
