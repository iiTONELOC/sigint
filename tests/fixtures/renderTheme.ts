import { themes } from "@/theme";
import { isRenderWorkerColors } from "@/workers/render/protocol";
import {
  RENDER_THEME_COLOR_KEYS,
  type RenderWorkerColors,
} from "@shared/domain/theme";

enum RenderThemeFixtureError {
  Invalid = "The render theme fixture is invalid",
}

export function createRenderThemeFixture(): RenderWorkerColors {
  const entries = RENDER_THEME_COLOR_KEYS.map((key) => [
    key,
    themes.dark.colors[key],
  ]);
  const theme: unknown = Object.fromEntries(entries);
  if (!isRenderWorkerColors(theme)) {
    throw new Error(RenderThemeFixtureError.Invalid);
  }
  return theme;
}
