import {
  createElement,
  forwardRef,
  type ClassAttributes,
  type HTMLAttributes,
} from "react";
import { RENDER_SURFACE_TAG } from "@/render-surface/registration";
import { SURFACE_TOUCH_MODE_ATTRIBUTE, SurfaceTouchMode } from "@/render-surface/input";

export type RenderSurfaceHostProps = Readonly<{
  className?: string;
  touchMode?: SurfaceTouchMode;
}>;

export const RenderSurfaceHost = forwardRef<
  HTMLElement,
  RenderSurfaceHostProps
>(function RenderSurfaceHost({ className, touchMode = SurfaceTouchMode.Globe }, ref) {
  const props: ClassAttributes<HTMLElement> & HTMLAttributes<HTMLElement> & Record<string, unknown> = {
    ref,
    className,
    [SURFACE_TOUCH_MODE_ATTRIBUTE]: touchMode,
  };
  return createElement(RENDER_SURFACE_TAG, props);
});
