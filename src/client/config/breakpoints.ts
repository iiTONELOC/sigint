enum BreakpointCssVariable {
  Mobile = "--breakpoint-md",
}

enum BreakpointCssUnit {
  Pixels = "px",
}

enum BreakpointErrorMessage {
  InvalidMobile = "The CSS mobile breakpoint must be a positive pixel value",
}

class BreakpointConfigurationError extends Error {
  constructor() {
    super(BreakpointErrorMessage.InvalidMobile);
    this.name = BreakpointConfigurationError.name;
  }
}

let mobileBreakpointPixels: number | null = null;

function getMobileBreakpointPixels(): number {
  if (mobileBreakpointPixels !== null) return mobileBreakpointPixels;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(BreakpointCssVariable.Mobile)
    .trim();
  const pixels = Number.parseFloat(value);
  if (
    !value.endsWith(BreakpointCssUnit.Pixels) ||
    !Number.isFinite(pixels) ||
    pixels <= 0
  ) {
    throw new BreakpointConfigurationError();
  }
  mobileBreakpointPixels = pixels;
  return pixels;
}

export function isMobileWidth(widthPx: number): boolean {
  return widthPx < getMobileBreakpointPixels();
}
