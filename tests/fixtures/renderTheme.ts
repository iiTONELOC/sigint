import { themes } from "@/config/theme";
import {
  RenderColorKey,
  isRenderWorkerColors,
  type RenderWorkerColors,
} from "@/workers/render/protocol";

enum RenderThemeFixtureError {
  Invalid = "The render theme fixture is invalid",
}

export function createRenderThemeFixture(): RenderWorkerColors {
  const entries = Object.values(RenderColorKey).map((key) => [
    key,
    themes.dark.colors[key],
  ]);
  const theme: unknown = Object.fromEntries(entries);
  if (!isRenderWorkerColors(theme)) {
    throw new Error(RenderThemeFixtureError.Invalid);
  }
  return theme;
}
