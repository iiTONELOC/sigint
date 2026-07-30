import { describe, expect, test } from "bun:test";
import {
  RenderGlobeStateStore,
} from "@/render-surface/globeStateStore";
import {
  RenderGlobeCommandKind,
  RenderProjectionMode,
  RenderRotationSpeedPolicy,
  type RenderGlobeCommand,
} from "@/workers/render/protocol";

describe("RenderGlobeStateStore", () => {
  test("owns a disconnected seed without React state", () => {
    const store = new RenderGlobeStateStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.dispatch({
      kind: RenderGlobeCommandKind.SetProjection,
      projection: RenderProjectionMode.Flat,
    });

    expect(store.read().projection).toBe(RenderProjectionMode.Flat);
    expect(notifications).toBe(1);
    unsubscribe();
  });

  test("replays the retained snapshot when a worker connects", () => {
    const store = new RenderGlobeStateStore();
    store.dispatch({
      kind: RenderGlobeCommandKind.SetRotationEnabled,
      enabled: true,
    });
    const sent: RenderGlobeCommand[] = [];

    const disconnect = store.connect((command) => {
      sent.push(command);
    });

    expect(sent).toEqual([
      {
        kind: RenderGlobeCommandKind.SetProjection,
        projection: RenderProjectionMode.Globe,
      },
      {
        kind: RenderGlobeCommandKind.SetRotationEnabled,
        enabled: true,
      },
      {
        kind: RenderGlobeCommandKind.SetRotationSpeed,
        speed: RenderRotationSpeedPolicy.Default,
      },
    ]);
    disconnect();
  });

  test("stays read-only until the active worker publishes state", () => {
    const store = new RenderGlobeStateStore();
    const sent: RenderGlobeCommand[] = [];
    const disconnect = store.connect((command) => {
      sent.push(command);
    });
    sent.length = 0;

    store.dispatch({
      kind: RenderGlobeCommandKind.SetRotationSpeed,
      speed: RenderRotationSpeedPolicy.Maximum,
    });

    expect(sent).toEqual([
      {
        kind: RenderGlobeCommandKind.SetRotationSpeed,
        speed: RenderRotationSpeedPolicy.Maximum,
      },
    ]);
    expect(store.read().rotationSpeed).toBe(
      RenderRotationSpeedPolicy.Default,
    );

    expect(
      store.accept({
        projection: RenderProjectionMode.Globe,
        rotationEnabled: false,
        rotationSpeed: RenderRotationSpeedPolicy.Maximum,
      }),
    ).toBe(true);
    expect(store.read().rotationSpeed).toBe(
      RenderRotationSpeedPolicy.Maximum,
    );
    disconnect();
  });
});
