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
    const commands: Parameters<typeof sender.send>[0][] = [
      { type: RenderMessageType.Dispose },
      { type: RenderMessageType.Viewport, payload: { width: 800, height: 600, devicePixelRatio: 2, isMobile: false } },
      {
        type: RenderMessageType.Selection,
        payload: { source: Domain.Aircraft, entityId: "aircraft-a", interactionId: "aircraft-a", pointType: Domain.Aircraft },
      },
    ];
    for (const command of commands) sender.send(command);

    expect(messages).toEqual(commands.map((command, index) => ({
      ...command,
      protocolVersion: RenderProtocolVersion.Current,
      sessionId: "session-a",
      sequence: index + 1,
    })));
  });
});
