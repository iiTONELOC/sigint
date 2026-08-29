import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import type {
  TrailEntry,
} from "@/lib/geo/trails/trailStore";
import {
  ScenePublisher,
} from "@/workers/data/render-codecs/scenePublisher";
import {
  SelectionInterestService,
} from "@/workers/data/selectionInterestService";
import type {
  RenderSelectionSnapshot,
} from "@/workers/render/protocol";
import {
  SceneInterestPublisher,
} from "@/workers/render/sceneInterestPublisher";
import {
  parseSceneDataCommand,
  parseSceneInterestCommand,
  SceneDataCommandType,
  SceneInterestCommandType,
  SessionSequenceState,
} from "@/workers/render/sceneProtocol";
import {
  SelectionOverlayStore,
} from "@/workers/render/selectionOverlayStore";

enum SelectionOverlayChannelFixture {
  SessionId = "render-session",
}

describe("selection overlay channel", () => {
  test("carries selection interest and overlay on one channel", async () => {
    const channel = new MessageChannel();
    const scenePublisher = new ScenePublisher();
    const interestPublisher = new SceneInterestPublisher();
    const overlayStore = new SelectionOverlayStore();
    const dataState = new SessionSequenceState(
      SelectionOverlayChannelFixture.SessionId,
    );
    const renderState = new SessionSequenceState(
      SelectionOverlayChannelFixture.SessionId,
    );
    const selected: RenderSelectionSnapshot = {
      revision: 1,
      identity: {
        source: Domain.Aircraft,
        entityId: "aircraft-a",
        interactionId: "aircraft-a",
        pointType: Domain.Aircraft,
      },
    };
    const trail: TrailEntry = {
      type: Domain.Aircraft,
      points: [{
        lat: 40,
        lon: -74,
        ts: 100,
      }],
      lastSeen: 100,
      heading: 90,
      speedMps: 200,
    };
    const selectionInterest = new SelectionInterestService(
      {
        get: (id) => id === selected.identity?.entityId
          ? trail
          : null,
      },
      {
        route: async () => null,
      },
      (overlay) => {
        scenePublisher.publish(overlay);
      },
    );

    const overlayReceived = new Promise<void>((resolve) => {
      channel.port2.onmessage = (event: MessageEvent<unknown>) => {
        const command = parseSceneDataCommand(event.data);
        if (!command || !renderState.accept(command)) return;
        if (command.type !== SceneDataCommandType.SelectionOverlay) {
          return;
        }
        if (overlayStore.apply(command, selected)) resolve();
      };
    });
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const command = parseSceneInterestCommand(event.data);
      if (
        !command ||
        !dataState.accept(command) ||
        command.type !== SceneInterestCommandType.Selection
      ) {
        return;
      }
      selectionInterest.update(command.selection);
    };

    try {
      channel.port1.start();
      channel.port2.start();
      scenePublisher.connect(
        channel.port1,
        SelectionOverlayChannelFixture.SessionId,
      );
      interestPublisher.connect(
        channel.port2,
        SelectionOverlayChannelFixture.SessionId,
      );
      expect(interestPublisher.publishSelection(selected)).toBe(true);

      await overlayReceived;

      expect(overlayStore.snapshot()).toMatchObject({
        selection: selected,
        trail: trail.points,
        route: null,
      });
    } finally {
      interestPublisher.disconnect();
      scenePublisher.disconnect();
      channel.port1.close();
      channel.port2.close();
    }
  });
});
