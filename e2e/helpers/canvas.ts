import {
  expect,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  RENDER_SURFACE_TAG,
} from "../../src/client/render-surface/registration";

/** Return the canvas owned by the registered render surface. */
export function renderSurfaceCanvas(page: Page): Locator {
  return page.locator(`${RENDER_SURFACE_TAG} canvas`).first();
}

/** Wait until both workers are connected and the first sized frame exists. */
export async function waitForCanvasFirstFrame(
  page: Page,
): Promise<Locator> {
  const canvas = renderSurfaceCanvas(page);
  await expect(canvas).toBeVisible();
  await expect.poll(() =>
    canvas.evaluate((element) => {
      if (!(element instanceof HTMLCanvasElement)) return false;
      return (
        element.dataset.renderWorkerReady === String(true) &&
        element.dataset.renderDataChannelReady === String(true) &&
        element.width > 0 &&
        element.height > 0
      );
    }),
  ).toBe(true);
  return canvas;
}
