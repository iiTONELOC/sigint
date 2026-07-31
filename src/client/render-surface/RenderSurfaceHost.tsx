import {
  createElement,
  forwardRef,
  type ClassAttributes,
  type HTMLAttributes,
} from "react";
import { RENDER_SURFACE_TAG } from "@/render-surface/registration";

export type RenderSurfaceHostProps = Readonly<{
  className?: string;
}>;

export const RenderSurfaceHost = forwardRef<
  HTMLElement,
  RenderSurfaceHostProps
>(function RenderSurfaceHost({ className }, ref) {
  const props = {
    ref,
    className,
  } satisfies ClassAttributes<HTMLElement> & HTMLAttributes<HTMLElement>;
  return createElement(RENDER_SURFACE_TAG, props);
});
