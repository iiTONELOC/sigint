// Single owner for the JS-side responsive breakpoints. Mirrors Tailwind's `md`
// (768px) so DOM-measurement code and CSS agree on where "mobile" ends. Every
// `window.innerWidth < 768` site reads MOBILE_BREAKPOINT_PX instead.

/** Viewport widths at or below this (px) are treated as mobile. Matches Tailwind `md`. */
export const MOBILE_BREAKPOINT_PX = 768;

/** True when a measured viewport width is in the mobile range. */
export function isMobileWidth(widthPx: number): boolean {
  return widthPx < MOBILE_BREAKPOINT_PX;
}
