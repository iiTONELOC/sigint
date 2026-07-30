import { useEffect } from "react";
import { sendRenderSurfaceCommand } from "@/render-surface/element";
import {
  RenderMessageType,
  type RenderWorkerColors,
} from "@/workers/render/protocol";

/**
 * The theme is the only thing about the drawing that React still owns; every
 * point now reaches the renderer from the DataWorker.
 */
export function useColorCommands(
  host: HTMLElement | null,
  colors: RenderWorkerColors,
): void {
  useEffect(() => {
    if (!host) return;
    sendRenderSurfaceCommand(host, {
      type: RenderMessageType.Colors,
      payload: colors,
    });
  }, [host, colors]);
}
