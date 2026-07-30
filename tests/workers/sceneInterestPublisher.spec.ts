import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import {
  SceneInterestPublisher,
} from "@/workers/render/sceneInterestPublisher";
import {
  SceneInterestCommandType,
  SceneProtocolVersion,
} from "@/workers/render/sceneProtocol";

describe("scene interest publisher", () => {
  test("publishes selection revisions in its own sequence", () => {
    const messages: unknown[] = [];
    const publisher = new SceneInterestPublisher();
    publisher.connect({
      postMessage: (message) => {
        messages.push(message);
      },
    }, "session-a");

    expect(publisher.publish({
      revision: 1,
      identity: {
        source: Domain.Aircraft,
        entityId: "aircraft-a",
        interactionId: "aircraft-a",
        pointType: Domain.Aircraft,
      },
    })).toBe(true);
    expect(publisher.publish({
      revision: 2,
      identity: null,
    })).toBe(true);

    expect(messages).toEqual([
      {
        type: SceneInterestCommandType.Selection,
        selection: {
          revision: 1,
          identity: {
            source: Domain.Aircraft,
            entityId: "aircraft-a",
            interactionId: "aircraft-a",
            pointType: Domain.Aircraft,
          },
        },
        protocolVersion: SceneProtocolVersion.Current,
        sessionId: "session-a",
        sequence: 1,
      },
      {
        type: SceneInterestCommandType.Selection,
        selection: {
          revision: 2,
          identity: null,
        },
        protocolVersion: SceneProtocolVersion.Current,
        sessionId: "session-a",
        sequence: 2,
      },
    ]);
  });
});
