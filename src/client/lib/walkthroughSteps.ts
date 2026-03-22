// ── Walkthrough step definitions ─────────────────────────────────────
// Two tiers: essential (first-time quick tour) and advanced (opt-in).
// Each step targets a DOM element via data-tour="..." attribute.
// Desktop-first — mobile will use a separate step set (future).
//
// Steps can be:
//   - "info"   → user clicks NEXT to advance
//   - "action" → user performs an action, walkthrough detects completion
//                 via leafTypes/leafCount/presetCount and auto-advances

export type StepPlacement = "top" | "bottom" | "left" | "right";

export type WalkthroughStep = {
  /** Unique key for this step */
  id: string;
  /** CSS selector — must match a data-tour attribute on the target element */
  targetSelector: string;
  /** Bold heading in the tooltip */
  title: string;
  /** Body text — 1-2 short sentences */
  description: string;
  /** Where to place the tooltip relative to the cutout */
  placement: StepPlacement;
  /**
   * "info" = NEXT button advances.
   * "action" = walkthrough waits for a layout change that satisfies `completionCheck`.
   */
  mode: "info" | "action";
  /**
   * For action steps: returns true when the user has completed the action.
   * Receives current leaf type set, leaf count, and preset count.
   */
  completionCheck?: (
    leafTypes: Set<string>,
    leafCount: number,
    presetCount: number,
  ) => boolean;
  /**
   * For action steps: the pane type that SHOULD be added.
   * Any other pane type added triggers an undo.
   */
  expectedPaneType?: string;
  /**
   * Optional: the button/element to highlight with a pulsing ring.
   * If not set, targetSelector is highlighted (info steps).
   * For action steps, this points at the button the user should click first.
   */
  buttonSelector?: string;
  /**
   * Optional secondary selector to highlight with a pulsing ring
   * (e.g. the menu item the user should pick after clicking the button).
   */
  highlightSelector?: string;
};

// ── Essential steps (Tier 1) — always shown on first visit ──────────

export const ESSENTIAL_STEPS: WalkthroughStep[] = [
  {
    id: "welcome",
    targetSelector: '[data-tour="header-brand"]',
    title: "Welcome to SIGINT",
    description:
      "Real-time global intelligence dashboard with live aircraft, vessel, seismic, fire, weather, and event tracking.",
    placement: "bottom",
    mode: "info",
  },
  {
    id: "layers",
    targetSelector: '[data-tour="layer-toggles"]',
    title: "Data Layers",
    description:
      "Toggle layers on and off — aircraft, vessels, seismic, fires, weather, and GDELT events. Each is color-coded.",
    placement: "bottom",
    mode: "info",
  },
  {
    id: "globe",
    targetSelector: '[data-tour="globe-pane"]',
    title: "The Globe",
    description:
      "Click any point to select it. Double-click to zoom in. Drag to rotate, scroll to zoom. Click empty space to deselect.",
    placement: "right",
    mode: "info",
  },
  {
    id: "search",
    targetSelector: '[data-tour="search"]',
    title: "Global Search",
    description:
      "Search across all data — callsigns, vessel names, locations. Matching results filter the globe in real-time.",
    placement: "bottom",
    mode: "info",
  },
  {
    id: "split-right",
    targetSelector: '[data-tour="globe-pane"]',
    title: "Add a Pane — Split Right",
    description:
      'Click the highlighted "Split right" button, then pick NEWS FEED from the menu.',
    placement: "left",
    mode: "action",
    completionCheck: (types) => types.has("news-feed"),
    expectedPaneType: "news-feed",
    buttonSelector: '[data-tour="split-right-btn"]',
    highlightSelector: '[data-tour="split-menu-news-feed"]',
  },
  {
    id: "split-down",
    targetSelector: '[data-tour="globe-pane"]',
    title: "Add Another — Split Down",
    description:
      'Click the highlighted "Split down" button, then pick ALERTS.',
    placement: "left",
    mode: "action",
    completionCheck: (types, count) =>
      types.has("news-feed") && types.has("alert-log") && count >= 3,
    expectedPaneType: "alert-log",
    buttonSelector: '[data-tour="split-down-btn"]',
    highlightSelector: '[data-tour="split-menu-alert-log"]',
  },
  {
    id: "save-preset",
    targetSelector: "",
    title: "Save Your Layout",
    description:
      "Click VIEWS, type a name, and click the save icon. Your layout is now a reusable preset.",
    placement: "bottom",
    mode: "action",
    completionCheck: (_types, _count, presetCount) => presetCount >= 1,
    buttonSelector: '[data-tour="views-btn"]',
  },
  {
    id: "ticker",
    targetSelector: '[data-tour="ticker"]',
    title: "Live Feed",
    description:
      "Scrolling ticker of latest activity across all sources. Click any item to select and zoom on the globe.",
    placement: "top",
    mode: "info",
  },
];

// ── Advanced steps (Tier 2) — shown only if user opts in ────────────

export const ADVANCED_STEPS: WalkthroughStep[] = [
  {
    id: "aircraft-filter",
    targetSelector: '[data-tour="aircraft-filter"]',
    title: "Aircraft Filters",
    description:
      "Filter by status (airborne/ground), type (military/civilian), squawk codes, and country of origin.",
    placement: "bottom",
    mode: "info",
  },
  {
    id: "watch-mode",
    targetSelector: '[data-tour="globe-controls"]',
    title: "Watch Mode",
    description:
      "Auto-tour through alerts and intel products. The globe cycles through high-priority events every 8 seconds.",
    placement: "bottom",
    mode: "info",
  },
  {
    id: "globe-controls",
    targetSelector: '[data-tour="globe-controls"]',
    title: "Globe Controls",
    description:
      "Toggle flat/globe projection. Enable auto-rotation. FLAT view shows a full equirectangular map.",
    placement: "bottom",
    mode: "info",
  },
  {
    id: "settings",
    targetSelector: '[data-tour="settings-button"]',
    title: "Settings",
    description:
      "Theme, custom layer colors, ticker speed, data export/import, and storage management.",
    placement: "left",
    mode: "info",
  },
  {
    id: "complete",
    targetSelector: "",
    title: "You're Ready",
    description:
      "That's the full tour. Relaunch anytime from Settings → About. Happy hunting.",
    placement: "bottom",
    mode: "info",
  },
];

export const ESSENTIAL_COUNT = ESSENTIAL_STEPS.length;
export const ADVANCED_COUNT = ADVANCED_STEPS.length;
export const TOTAL_STEPS = ESSENTIAL_COUNT + ADVANCED_COUNT;
