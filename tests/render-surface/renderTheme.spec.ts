import { describe, expect, test } from "bun:test";
import { themes } from "@/config/theme";
import {
  RenderThemeAdapter,
  readRenderTheme,
  renderColorCssVariable,
  type RenderThemeStyle,
} from "@/render-surface/renderTheme";
import {
  RenderColorKey,
  type RenderWorkerColors,
} from "@/workers/render/protocol";
import {
  createRenderThemeFixture,
} from "../fixtures/renderTheme";

function createStyle(
  values: ReadonlyMap<string, string>,
): RenderThemeStyle {
  return {
    getPropertyValue: (name) => values.get(name) ?? "",
  };
}

describe("RenderThemeAdapter", () => {
  test("reads the complete render palette from CSS variables", () => {
    const theme = createRenderThemeFixture();
    const values = new Map(
      Object.values(RenderColorKey).map((key) => [
        renderColorCssVariable(key),
        theme[key],
      ]),
    );

    expect(readRenderTheme(createStyle(values))).toEqual(theme);
    values.delete(renderColorCssVariable(RenderColorKey.Accent));
    expect(readRenderTheme(createStyle(values))).toBeNull();
  });

  test("publishes initial and observed resolved themes", () => {
    const root = document.documentElement;
    const initial = createRenderThemeFixture();
    const values = new Map(
      Object.values(RenderColorKey).map((key) => [
        renderColorCssVariable(key),
        initial[key],
      ]),
    );
    const published: RenderWorkerColors[] = [];
    let notify = (): void => undefined;
    let disconnected = false;
    const adapter = new RenderThemeAdapter({
      root,
      readStyle: () => createStyle(values),
      createObserver: (listener) => {
        notify = listener;
        return {
          observe: () => undefined,
          disconnect: () => {
            disconnected = true;
          },
        };
      },
      setRenderTheme: (theme) => published.push(theme),
    });

    adapter.start();
    values.set(
      renderColorCssVariable(RenderColorKey.Accent),
      themes.light.colors.accent,
    );
    notify();
    adapter.stop();

    expect(published).toHaveLength(2);
    expect(published[0]).toEqual(initial);
    expect(published[1]?.accent).toBe(themes.light.colors.accent);
    expect(disconnected).toBe(true);
  });
});
