import {
  createRenderSurfaceElementClass,
  type RenderSurfaceElementOptions,
} from "@/render-surface/element";
import { createRenderSurfaceSession } from "@/render-surface/session";

export const RENDER_SURFACE_TAG = "sigint-render-surface";

const DEFAULT_OPTIONS: RenderSurfaceElementOptions = {
  createSession: () => createRenderSurfaceSession(),
};

export function registerRenderSurfaceElement(
  options: RenderSurfaceElementOptions = DEFAULT_OPTIONS,
): CustomElementConstructor {
  const registered = customElements.get(RENDER_SURFACE_TAG);
  if (registered) return registered;
  const elementClass = createRenderSurfaceElementClass(options);
  customElements.define(RENDER_SURFACE_TAG, elementClass);
  return elementClass;
}
