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
import {
  createDefaultRenderGlobeState,
} from "@/workers/render/globeStateController";
import { Domain } from "@shared/domain/identity";

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

    expect(sent).toContainEqual({
      kind: RenderGlobeCommandKind.SetProjection,
      projection: RenderProjectionMode.Globe,
    });
    expect(sent).toContainEqual({
      kind: RenderGlobeCommandKind.SetRotationEnabled,
      enabled: true,
    });
    expect(sent).toContainEqual({
      kind: RenderGlobeCommandKind.SetLayerVisibility,
      layer: Domain.Ships,
      visible: true,
    });
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
        ...createDefaultRenderGlobeState(),
        rotationSpeed: RenderRotationSpeedPolicy.Maximum,
      }),
    ).toBe(true);
    expect(store.read().rotationSpeed).toBe(
      RenderRotationSpeedPolicy.Maximum,
    );
    disconnect();
  });

  test("dispatches layer commands through the same state owner", () => {
    const store = new RenderGlobeStateStore();

    store.dispatch({
      kind: RenderGlobeCommandKind.ToggleLayer,
      layer: Domain.Ships,
    });

    expect(store.read().layers[Domain.Ships]).toBe(false);
  });
});
