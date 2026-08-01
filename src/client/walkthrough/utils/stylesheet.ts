export enum WalkthroughStyleSlot {
  Cutout = "cutout",
  HighlightPrimary = "highlight-primary",
  HighlightQuaternary = "highlight-quaternary",
  HighlightSecondary = "highlight-secondary",
  HighlightTertiary = "highlight-tertiary",
  Indicator = "indicator",
  LandingZone = "landing-zone",
  MaskCutout = "mask-cutout",
  Tooltip = "tooltip",
}

enum WalkthroughStyleVariable {
  Color = "--walkthrough-color",
  Height = "--walkthrough-height",
  Left = "--walkthrough-left",
  MaxWidth = "--walkthrough-max-width",
  Top = "--walkthrough-top",
  Width = "--walkthrough-width",
}

enum WalkthroughStyleEffect {
  HighlightShadow = "0 0 16px color-mix(in srgb, var(--walkthrough-color) 50%, transparent), 0 0 6px color-mix(in srgb, var(--walkthrough-color) 30%, transparent), inset 0 0 8px color-mix(in srgb, var(--walkthrough-color) 10%, transparent)",
  IndicatorRing = "color-mix(in srgb, var(--walkthrough-color) 60%, transparent)",
  IndicatorShadow = "0 0 20px color-mix(in srgb, var(--walkthrough-color) 90%, transparent), 0 0 40px color-mix(in srgb, var(--walkthrough-color) 90%, transparent)",
}

enum WalkthroughStyleSheetText {
  Base = `
@keyframes walkthrough-ring {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(3); opacity: 0; }
}
[data-wt-style^="highlight-"] {
  top: var(--walkthrough-top);
  left: var(--walkthrough-left);
  width: var(--walkthrough-width);
  height: var(--walkthrough-height);
}
[data-wt-style="${WalkthroughStyleSlot.Indicator}"],
[data-wt-style="${WalkthroughStyleSlot.Tooltip}"] {
  top: var(--walkthrough-top);
  left: var(--walkthrough-left);
}
[data-wt-style="${WalkthroughStyleSlot.Tooltip}"] {
  max-width: var(--walkthrough-max-width);
  touch-action: none;
  overscroll-behavior: none;
  pointer-events: auto;
  transition: opacity 0.2s ease-out, left 0.25s ease-out, top 0.25s ease-out;
}
[data-wt-style="${WalkthroughStyleSlot.Tooltip}"][data-wt-dragging="true"] {
  transition: opacity 0.2s ease-out;
}
[data-wt-style="${WalkthroughStyleSlot.LandingZone}"],
[data-wt-style="${WalkthroughStyleSlot.Cutout}"] {
  top: var(--walkthrough-top);
  left: var(--walkthrough-left);
  width: var(--walkthrough-width);
  height: var(--walkthrough-height);
}
[data-wt-style="${WalkthroughStyleSlot.MaskCutout}"] {
  x: var(--walkthrough-left);
  y: var(--walkthrough-top);
  width: var(--walkthrough-width);
  height: var(--walkthrough-height);
}
[data-wt-style^="highlight-"] {
  border-color: var(${WalkthroughStyleVariable.Color});
  box-shadow: ${WalkthroughStyleEffect.HighlightShadow};
}
[data-wt-ring-color="${WalkthroughRingColor.Accent}"] {
  ${WalkthroughStyleVariable.Color}: var(--sigint-accent);
}
[data-wt-ring-color="${WalkthroughRingColor.Danger}"] {
  ${WalkthroughStyleVariable.Color}: var(--sigint-danger);
}
[data-wt-ring-color="${WalkthroughRingColor.Magenta}"] {
  ${WalkthroughStyleVariable.Color}: var(--sigint-events);
}
[data-wt-ring-color="${WalkthroughRingColor.Warning}"] {
  ${WalkthroughStyleVariable.Color}: var(--sigint-warn);
}
[data-wt-click-mode="${WalkthroughClickMode.Select}"],
[data-wt-click-mode="${WalkthroughClickMode.Deselect}"] {
  ${WalkthroughStyleVariable.Color}: var(--sigint-accent);
}
[data-wt-click-mode="${WalkthroughClickMode.Focus}"] {
  ${WalkthroughStyleVariable.Color}: var(--sigint-warn);
}
.walkthrough-indicator-ring {
  border-color: ${WalkthroughStyleEffect.IndicatorRing};
}
.walkthrough-indicator-dot {
  color: var(${WalkthroughStyleVariable.Color});
  background-color: var(${WalkthroughStyleVariable.Color});
  box-shadow: ${WalkthroughStyleEffect.IndicatorShadow};
}
.walkthrough-indicator-label {
  color: var(${WalkthroughStyleVariable.Color});
  text-shadow: 0 0 8px currentColor;
}
`,
}

type WalkthroughDynamicRule = Readonly<{
  height?: number;
  left: number;
  maxWidth?: number;
  top: number;
  width?: number;
}>;

const dynamicRules = new Map<WalkthroughStyleSlot, string>();
let walkthroughStyleSheet: CSSStyleSheet | null = null;

function pixels(value: number): string {
  return `${value}px`;
}

function ruleText(
  slot: WalkthroughStyleSlot,
  rule: WalkthroughDynamicRule,
): string {
  const declarations = [
    `${WalkthroughStyleVariable.Left}:${pixels(rule.left)}`,
    `${WalkthroughStyleVariable.Top}:${pixels(rule.top)}`,
  ];
  if (rule.width !== undefined) {
    declarations.push(
      `${WalkthroughStyleVariable.Width}:${pixels(rule.width)}`,
    );
  }
  if (rule.height !== undefined) {
    declarations.push(
      `${WalkthroughStyleVariable.Height}:${pixels(rule.height)}`,
    );
  }
  if (rule.maxWidth !== undefined) {
    declarations.push(
      `${WalkthroughStyleVariable.MaxWidth}:${pixels(rule.maxWidth)}`,
    );
  }
  return `[data-wt-style="${slot}"]{${declarations.join(";")}}`;
}

function ensureStyleSheet(): CSSStyleSheet | null {
  if (
    typeof document === "undefined" ||
    typeof CSSStyleSheet === "undefined" ||
    !("adoptedStyleSheets" in document)
  ) {
    return null;
  }
  if (walkthroughStyleSheet) return walkthroughStyleSheet;
  walkthroughStyleSheet = new CSSStyleSheet();
  document.adoptedStyleSheets = [
    ...document.adoptedStyleSheets,
    walkthroughStyleSheet,
  ];
  return walkthroughStyleSheet;
}

function renderStyleSheet(): void {
  const sheet = ensureStyleSheet();
  if (!sheet) return;
  sheet.replaceSync(
    `${WalkthroughStyleSheetText.Base}\n${[...dynamicRules.values()].join("\n")}`,
  );
}

export function setWalkthroughStyleRule(
  slot: WalkthroughStyleSlot,
  rule: WalkthroughDynamicRule,
): void {
  dynamicRules.set(slot, ruleText(slot, rule));
  renderStyleSheet();
}

export function removeWalkthroughStyleRule(
  slot: WalkthroughStyleSlot,
): void {
  dynamicRules.delete(slot);
  renderStyleSheet();
}
import {
  WalkthroughClickMode,
  WalkthroughRingColor,
} from "../model";
