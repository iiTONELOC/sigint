import type { Page, Locator } from "@playwright/test";

// ── Canvas helpers ────────────────────────────────────────────────
// The globe is drawn on a 2D canvas. Behavioral assertions sample
// pixels at known projected coordinates. Used by cyclones-render.spec
// to verify storm glyphs land where expected after fixture mocking.

/**
 * Sample a pixel from the canvas at (x, y).
 * Returns [r, g, b, a].
 */
export async function pixelAt(
  canvas: Locator,
  x: number,
  y: number,
): Promise<[number, number, number, number]> {
  return await canvas.evaluate(
    (el, [px, py]) => {
      const ctx = (el as HTMLCanvasElement).getContext("2d");
      if (!ctx) return [0, 0, 0, 0];
      const data = ctx.getImageData(px, py, 1, 1).data;
      return [data[0]!, data[1]!, data[2]!, data[3]!];
    },
    [x, y],
  );
}

/** Hex distance — quick check that a pixel is "near" the cyclone color. */
export function colorDistance(
  a: [number, number, number, number],
  b: [number, number, number],
): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Parse "#rrggbb" → [r, g, b]. */
export function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** Project (lat, lon) to canvas pixel coords using the same math as
 *  src/client/components/globe/projection.ts. Assumes the default globe
 *  view. The function is exposed on window.__projectLatLon by the dev
 *  build (see frontend.tsx — gated on NODE_ENV !== "production"). */
export async function projectLatLon(
  page: Page,
  lat: number,
  lon: number,
): Promise<{ x: number; y: number; z: number }> {
  return await page.evaluate(
    ([la, lo]) => {
      const fn = (window as unknown as Record<string, unknown>)
        .__projectLatLon as
        | ((la: number, lo: number) => { x: number; y: number; z: number })
        | undefined;
      if (typeof fn !== "function") {
        throw new Error(
          "window.__projectLatLon is not exposed; ensure dev build / E2E env",
        );
      }
      return fn(la, lo);
    },
    [lat, lon],
  );
}

/** Wait for the canvas to be sized + the worker to have rendered ≥1 frame. */
export async function waitForCanvasFirstFrame(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas") as HTMLCanvasElement | null;
    return !!c && c.width > 0 && c.height > 0;
  });
  // Worker rAF settle window.
  await page.waitForTimeout(500);
}
