import { useSyncExternalStore } from "react";
import {
  readRenderGlobeState,
  subscribeRenderGlobeState,
} from "@/render-surface/globeStateStore";
import type {
  RenderGlobeStateSnapshot,
} from "@/workers/render/protocol";

export function useRenderGlobeState(): RenderGlobeStateSnapshot {
  return useSyncExternalStore(
    subscribeRenderGlobeState,
    readRenderGlobeState,
    readRenderGlobeState,
  );
}
