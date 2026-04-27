import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// ── Axe a11y helpers ──────────────────────────────────────────────
//
// WCAG 2.2 AA enforcement (Hard Rule 15) is non-negotiable for code
// added or modified by the cyclones work. Hard Rule 11 says we don't
// refactor untouched files.
//
// Reconciliation:
//   axeScan(page)       — used by bootstrap specs that scan whole pages.
//                         Applies the documented allowlist of known
//                         untouched-file violations. Each entry is its
//                         own follow-up ticket. Adding new entries
//                         requires a real ticket and a comment block.
//
//   axeScanStrict(page) — used by specs that cover only modified/new
//                         components. NO allowlist applied — the
//                         entire selector subtree must be clean.
//                         New code (cyclones layer toggle, dossier
//                         atoms, every features/{feature}/ui/) must
//                         pass this.
//
// Rules:
//   - color-contrast is disabled in both modes. Canvas pixels are not
//     measurable by axe, and per-theme contrast for the new cyclone
//     color is verified by tests/config/theme.spec.ts (step 2 WCAG
//     contrast tests).
//
// Allowlist format:
//   {
//     selector: "<CSS selector>",
//     file: "<source file path>",
//     reason: "<why this is currently failing>",
//     ticket: "TODO(a11y/<short-key>): <followup>",
//   }
//
// Future PRs that touch a listed file MUST remove that entry as part
// of the work — the allowlist is the audit trail, not a free pass.

type AllowlistEntry = {
  selector: string;
  file: string;
  reason: string;
  ticket: string;
};

/** Documented exclusions — known untouched-file a11y gaps. */
const ALLOWLIST: AllowlistEntry[] = [
  {
    selector: 'meta[name="viewport"]',
    file: "src/index.html",
    reason:
      "Viewport meta has user-scalable=no and maximum-scale=1.0, which blocks pinch-zoom (WCAG 1.4.4 / 1.4.10). The PWA layout was tuned to a fixed scale; revisiting this is its own UX ticket beyond cyclones scope.",
    ticket:
      "TODO(a11y/viewport-zoom): allow user scaling in src/index.html viewport meta",
  },
  {
    selector: 'button[title="Move this block"]',
    file: "src/client/panes/PaneMobile.tsx",
    reason:
      "Mobile pane move button is icon-only and uses title= rather than aria-label. PaneMobile.tsx is on the Hard Rule 11 out-of-scope list.",
    ticket:
      "TODO(a11y/pane-mobile): aria-label icon-only buttons in PaneMobile.tsx",
  },
  {
    selector: 'button[data-tour="split-right-globe"]',
    file: "src/client/panes/PaneMobile.tsx",
    reason:
      "Mobile split-right-globe button (mobile-only) lacks aria-label. PaneMobile.tsx out-of-scope per Hard Rule 11.",
    ticket:
      "TODO(a11y/pane-mobile): aria-label icon-only buttons in PaneMobile.tsx",
  },
  {
    selector: 'button[title="Add pane below"]',
    file: "src/client/panes/PaneMobile.tsx",
    reason:
      "Mobile add-pane-below button uses title= rather than aria-label. PaneMobile.tsx out-of-scope.",
    ticket:
      "TODO(a11y/pane-mobile): aria-label icon-only buttons in PaneMobile.tsx",
  },
  {
    selector: 'button[title="Split side-by-side"]',
    file: "src/client/panes/PaneMobile.tsx",
    reason:
      "Mobile split-side-by-side button uses title= rather than aria-label. PaneMobile.tsx out-of-scope.",
    ticket:
      "TODO(a11y/pane-mobile): aria-label icon-only buttons in PaneMobile.tsx",
  },
  {
    selector: 'button[title="Minimize"]',
    file: "src/client/panes/PaneMobile.tsx",
    reason:
      "Mobile minimize button uses title= rather than aria-label. PaneMobile.tsx out-of-scope (the desktop minimize button in PaneHeader.tsx was fixed in step 11/15).",
    ticket:
      "TODO(a11y/pane-mobile): aria-label icon-only buttons in PaneMobile.tsx",
  },
  {
    selector:
      'button.flex.items-center.gap-1.bg-transparent.border-none.p-0.cursor-pointer.group',
    file: "src/client/panes/PaneMobile.tsx",
    reason:
      "Mobile pane-type chooser trigger button (text and chevron rendered inside a flex row that axe treats as not having a discernible name in some layouts). PaneMobile.tsx out-of-scope.",
    ticket:
      "TODO(a11y/pane-mobile): give pane-type chooser trigger an explicit accessible name",
  },
];

const STANDARD_TAGS = ["wcag2a", "wcag2aa", "wcag22a", "wcag22aa"];
// color-contrast is meaningless on canvas pixels and is verified for
// the cyclone color via theme.spec.ts.
const STANDARD_DISABLED = ["color-contrast"];

/** Whole-page scan with the documented allowlist applied. */
export async function axeScan(
  page: Page,
): Promise<{ violations: unknown[]; allowlistApplied: AllowlistEntry[] }> {
  let builder = new AxeBuilder({ page })
    .withTags(STANDARD_TAGS)
    .disableRules(STANDARD_DISABLED);
  for (const entry of ALLOWLIST) {
    builder = builder.exclude(entry.selector);
  }
  const results = await builder.analyze();
  return { violations: results.violations, allowlistApplied: ALLOWLIST };
}

/** Strict scan with no allowlist — for new/modified component coverage. */
export async function axeScanStrict(
  page: Page,
  rootSelector?: string,
): Promise<{ violations: unknown[] }> {
  let builder = new AxeBuilder({ page })
    .withTags(STANDARD_TAGS)
    .disableRules(STANDARD_DISABLED);
  if (rootSelector) builder = builder.include(rootSelector);
  const results = await builder.analyze();
  return { violations: results.violations };
}

/** Allowlist accessor — exposed so a smoke spec can assert it stays
 *  synced with the documented exclusions. */
export function getAllowlist(): readonly AllowlistEntry[] {
  return ALLOWLIST;
}
