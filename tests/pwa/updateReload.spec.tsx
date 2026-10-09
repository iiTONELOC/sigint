import { afterAll, afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act, type ReactElement } from "react";
import type { AircraftPoint } from "@shared/domain/aircraft";
import { Domain } from "@shared/domain/identity";
import { DomEvent, ServiceWorkerCarryKey } from "@/runtime";
import { IsolateMode } from "@/workers/render/protocol";
import { createDefaultRenderGlobeState } from "@/workers/render/globeStateController";
import { renderHook } from "../support/react";

enum UpdateReloadFixture {
  EntityId = "aircraft-a",
  Icao24 = "abc123",
}

const aircraft: AircraftPoint = {
  id: UpdateReloadFixture.EntityId,
  type: Domain.Aircraft,
  position: [0, 0],
  data: { icao24: UpdateReloadFixture.Icao24 },
};

const fakeClient = {
  getSourceEntity: async (source: string) => ({ source, value: aircraft }),
  getSourceSnapshot: () => null,
  subscribeSource: () => () => undefined,
};
let activeClient: typeof fakeClient | null = fakeClient;
const realClientExports = { ...(await import("@/lib/cache/dataWorkerClient")) };
mock.module("@/lib/cache/dataWorkerClient", () => ({
  ...realClientExports,
  getDataWorkerClient: () => activeClient ?? realClientExports.getDataWorkerClient(),
}));

const { registerSW } = await import("@/lib/runtime/swRegistration");
const {
  carryRenderGlobeStateAcrossUpdate,
  readRenderGlobeState,
  renderGlobeStateStore,
  toggleRenderLayer,
} = await import("@/render-surface/globeStateStore");
const { UIProvider, useUI } = await import("@/context/UIContext");
const { ThemeProvider } = await import("@/theme");

const serviceWorker = Object.assign(new EventTarget(), {
  controller: {},
  register: async () => ({ update: async () => undefined }),
});
Object.defineProperty(navigator, "serviceWorker", {
  configurable: true,
  value: serviceWorker,
});
const reload = spyOn(window.location, "reload").mockImplementation(() => undefined);

function withProviders(probe: ReactElement): ReactElement {
  return (
    <ThemeProvider>
      <UIProvider>{probe}</UIProvider>
    </ThemeProvider>
  );
}

function bootPage() {
  renderGlobeStateStore.accept(createDefaultRenderGlobeState());
  carryRenderGlobeStateAcrossUpdate();
  return renderHook(useUI, { wrapper: withProviders });
}

afterEach(() => {
  sessionStorage.clear();
});

afterAll(() => {
  activeClient = null;
});

describe("update reload", () => {
  test("brings back the selection, its isolate mode, and the globe layers", async () => {
    registerSW();
    const before = bootPage();
    act(() => {
      toggleRenderLayer(Domain.Ships);
      before.result.current.setSelected(aircraft);
      before.result.current.setIsolateMode(IsolateMode.Solo);
    });

    serviceWorker.dispatchEvent(new Event(DomEvent.ControllerChange));
    before.unmount();
    const after = bootPage();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(readRenderGlobeState().layers[Domain.Ships]).toBe(false);
    await after.waitFor(
      () => after.result.current.selected?.id === UpdateReloadFixture.EntityId,
    );
    expect(after.result.current.isolateMode).toBe(IsolateMode.Solo);
    after.unmount();
  });

  test("a load without an update reload restores nothing", async () => {
    sessionStorage.setItem(ServiceWorkerCarryKey.Selection, "{");
    const page = bootPage();

    await page.waitFor(() => sessionStorage.length === 0);

    expect(page.result.current.selected).toBeNull();
    expect(readRenderGlobeState().layers[Domain.Ships]).toBe(true);
    page.unmount();
  });
});
