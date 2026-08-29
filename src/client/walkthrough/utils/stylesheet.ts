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
  Height = "--walkthrough-height",
  Left = "--walkthrough-left",
  MaxWidth = "--walkthrough-max-width",
  Top = "--walkthrough-top",
  Width = "--walkthrough-width",
}

type WalkthroughDynamicRule = Readonly<{
  height?: number;
  left: number;
  maxWidth?: number;
  top: number;
  width?: number;
}>;

const dynamicRules: Partial<Record<WalkthroughStyleSlot, string>> = {};
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
  sheet.replaceSync(Object.values(dynamicRules).join("\n"));
}

export function setWalkthroughStyleRule(
  slot: WalkthroughStyleSlot,
  rule: WalkthroughDynamicRule,
): void {
  dynamicRules[slot] = ruleText(slot, rule);
  renderStyleSheet();
}

export function removeWalkthroughStyleRule(
  slot: WalkthroughStyleSlot,
): void {
  delete dynamicRules[slot];
  renderStyleSheet();
}
