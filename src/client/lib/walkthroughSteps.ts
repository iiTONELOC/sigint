// ── Walkthrough step definitions ─────────────────────────────────────
// Two tiers: essential (first-time quick tour) and advanced (opt-in).
// Each step targets a DOM element via data-tour="..." attribute.
// Desktop-first — mobile will use a separate step set (future).
//
// Steps can be:
//   - "info"   → user clicks NEXT to advance
//   - "action" → user performs an action, walkthrough detects completion
//                 via leafTypes/leafCount/presetCount and auto-advances

export type StepPlacement = "top" | "bottom" | "left" | "right" | "center";

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
   * Receives current leaf type set, leaf count, preset count, selected item id, and chrome hidden state.
   */
  completionCheck?: (
    leafTypes: Set<string>,
    leafCount: number,
    presetCount: number,
    selectedId: string | null,
    chromeHidden: boolean,
    videoPresetCount: number,
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
   * Color for the buttonSelector ring. Defaults to cyan.
   */
  buttonColor?: string;
  /**
   * Optional secondary selector to highlight with a pulsing ring
   * (e.g. the menu item the user should pick after clicking the button).
   */
  highlightSelector?: string;
  /**
   * Color for the highlightSelector ring. Defaults to "warn" (yellow).
   * Options: "warn" | "magenta" | "danger"
   */
  highlightColor?: string;
  /**
   * Optional tertiary selector for a third highlight ring (warn color).
   */
  tertiarySelector?: string;
  /**
   * Optional fourth highlight ring (magenta color).
   */
  quaternarySelector?: string;
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
  // ── Globe interaction sequence (3 action steps) ─────────────────
  {
    id: "globe-select",
    targetSelector: '[data-tour="globe-pane"]',
    title: "Select a Target",
    description:
      "Click any point on the globe to select it. A detail panel will appear.",
    placement: "right",
    mode: "action",
    completionCheck: (_t, _c, _p, selectedId) => selectedId !== null,
    buttonSelector: '[data-tour="globe-pane"]',
  },
  {
    id: "globe-drag-detail",
    targetSelector: '[data-tour="globe-pane"]',
    title: "Move the Detail Panel",
    description:
      "Grab the drag handle at the top of the detail panel and drag it out of the way.",
    placement: "right",
    mode: "info",
    buttonSelector: '[data-tour="detail-drag-handle"]',
  },
  {
    id: "globe-deselect",
    targetSelector: '[data-tour="globe-pane"]',
    title: "Deselect",
    description:
      "Click empty space outside the globe to deselect. The detail panel will close.",
    placement: "right",
    mode: "action",
    completionCheck: (_t, _c, _p, selectedId) => selectedId === null,
  },
  // ── Focus mode sequence (2 action steps) ────────────────────────
  {
    id: "focus-enter",
    targetSelector: '[data-tour="globe-pane"]',
    title: "Enter Focus Mode",
    description:
      "Click empty space outside the globe to hide all chrome and go fullscreen.",
    placement: "center",
    mode: "action",
    completionCheck: (_t, _c, _p, _s, chromeHidden) => chromeHidden === true,
  },
  {
    id: "focus-exit",
    targetSelector: "",
    title: "Exit Focus Mode",
    description:
      "Click empty space outside the globe to restore all controls. Great for presentations and briefings.",
    placement: "center",
    mode: "action",
    completionCheck: (_t, _c, _p, _s, chromeHidden) => chromeHidden === false,
  },
  {
    id: "search",
    targetSelector: "",
    title: "Global Search",
    description:
      "Search across all data — callsigns, vessel names, locations. Results filter the globe in real-time. Try it out or press NEXT.",
    placement: "center",
    mode: "info",
    buttonSelector: '[data-tour="search"]',
  },
  // ── Pane action steps (centered so they don't block menus) ──────
  {
    id: "split-right",
    targetSelector: '[data-tour="split-right-btn"]',
    title: "Add a Pane — Split Right",
    description:
      'Click the highlighted "Split right" button, then pick VIDEO FEED from the menu.',
    placement: "center",
    mode: "action",
    completionCheck: (types) => types.has("video-feed"),
    expectedPaneType: "video-feed",
    buttonSelector: '[data-tour="split-right-btn"]',
    highlightSelector: '[data-tour="split-menu-video-feed"]',
  },
  {
    id: "split-down",
    targetSelector: '[data-tour="split-down-btn"]',
    title: "Add Another — Split Down",
    description: 'Click the highlighted "Split down" button, then pick ALERTS.',
    placement: "center",
    mode: "action",
    completionCheck: (types, count) =>
      types.has("video-feed") && types.has("alert-log") && count >= 3,
    expectedPaneType: "alert-log",
    buttonSelector: '[data-tour="split-down-btn"]',
    highlightSelector: '[data-tour="split-menu-alert-log"]',
    highlightColor: "danger",
  },
  {
    id: "save-preset",
    targetSelector: "",
    title: "Save Your Layout",
    description:
      "Click VIEWS, type a name, and click the save icon. Your layout is now a reusable preset.",
    placement: "center",
    mode: "action",
    completionCheck: (_types, _count, presetCount) => presetCount >= 1,
    buttonSelector: '[data-tour="views-btn"]',
    highlightSelector: '[data-tour="preset-input"]',
    tertiarySelector: '[data-tour="preset-save-btn"]',
  },
  {
    id: "save-video-preset",
    targetSelector: "",
    title: "Save Video Channels",
    description:
      "Click the bookmark icon on the video pane, type a name, and save. Your channel selections are now a reusable preset.",
    placement: "center",
    mode: "action",
    completionCheck: (
      _types,
      _count,
      _presetCount,
      _selectedId,
      _chromeHidden,
      videoPresetCount,
    ) => videoPresetCount >= 1,
    buttonSelector: '[data-tour="video-preset-btn"]',
    buttonColor: "magenta",
    highlightSelector: '[data-tour="video-preset-input"]',
    highlightColor: "magenta",
    tertiarySelector: '[data-tour="video-preset-save-btn"]',
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
    targetSelector: "",
    title: "Watch Mode",
    description:
      "Auto-tour through alerts and intel products. The globe cycles through high-priority events every 8 seconds. Try clicking WATCH on the globe controls.",
    placement: "center",
    mode: "info",
    buttonSelector: '[data-tour="globe-controls"]',
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
      "That's the full tour. Relaunch anytime from Settings → Walkthrough. Happy hunting.",
    placement: "bottom",
    mode: "info",
  },
];

export const ESSENTIAL_COUNT = ESSENTIAL_STEPS.length;
export const ADVANCED_COUNT = ADVANCED_STEPS.length;
export const TOTAL_STEPS = ESSENTIAL_COUNT + ADVANCED_COUNT;

// ── Mobile essential steps (Tier 1) — 12 steps ─────────────────────
// No focus mode (disabled on mobile). Bottom sheet instead of drag.
// Pane splits via header buttons. All center placement.

export const MOBILE_ESSENTIAL_STEPS: WalkthroughStep[] = [
  {
    id: "welcome",
    targetSelector: '[data-tour="header-brand"]',
    title: "Welcome to SIGINT",
    description:
      "Real-time global intelligence dashboard with live aircraft, vessel, seismic, fire, weather, and event tracking.",
    placement: "center",
    mode: "info",
  },
  {
    id: "layers",
    targetSelector: '[data-tour="layer-toggles"]',
    title: "Data Layers",
    description:
      "Toggle layers on and off — aircraft, vessels, seismic, fires, weather, and GDELT events. Each is color-coded.",
    placement: "center",
    mode: "info",
    buttonSelector: '[data-tour="layer-toggles"]',
  },
  {
    id: "globe-select",
    targetSelector: '[data-tour="globe-pane"]',
    title: "Select a Target",
    description:
      "Tap any point on the globe to select it. A detail panel will slide up from the bottom.",
    placement: "center",
    mode: "action",
    completionCheck: (_t, _c, _p, selectedId) => selectedId !== null,
  },
  {
    id: "mobile-detail-sheet",
    targetSelector: '[data-tour="detail-close"]',
    title: "Detail Panel",
    description:
      "This is the detail panel — it shows info about the selected point. You can swipe it up to expand or down to shrink. Tap ✕ to close it now.",
    placement: "center",
    mode: "action",
    completionCheck: (_t, _c, _p, selectedId) => selectedId === null,
    buttonSelector: '[data-tour="detail-close"]',
    buttonColor: "danger",
  },
  {
    id: "search",
    targetSelector: "",
    title: "Global Search",
    description:
      "Search across all data — callsigns, vessel names, locations. Results filter the globe in real-time. Try it out or press NEXT.",
    placement: "center",
    mode: "info",
    buttonSelector: '[data-tour="search"]',
  },
  {
    id: "split-down",
    targetSelector: '[data-tour="split-down-btn"]',
    title: "Add VIDEO FEED",
    description:
      "Tap the split-down button in the globe pane header, then pick VIDEO FEED from the menu.",
    placement: "center",
    mode: "action",
    completionCheck: (types) => types.has("video-feed"),
    expectedPaneType: "video-feed",
    buttonSelector: '[data-tour="split-down-btn"]',
    highlightSelector: '[data-tour="split-menu-video-feed"]',
    highlightColor: "warn",
  },
  {
    id: "save-video-preset",
    targetSelector: "",
    title: "Save Video Channels",
    description:
      "Tap the bookmark icon on the video pane, type a name, and save. Your channel selections are now a reusable preset.",
    placement: "center",
    mode: "action",
    completionCheck: (
      _types,
      _count,
      _presetCount,
      _selectedId,
      _chromeHidden,
      videoPresetCount,
    ) => videoPresetCount >= 1,
    buttonSelector: '[data-tour="video-preset-btn"]',
    buttonColor: "magenta",
    highlightSelector: '[data-tour="video-preset-input"]',
    highlightColor: "magenta",
    tertiarySelector: '[data-tour="video-preset-save-btn"]',
  },
  {
    id: "split-down-alerts",
    targetSelector: '[data-tour="split-down-video-feed"]',
    title: "Add ALERTS",
    description:
      "Tap the split-down button on the VIDEO FEED pane header, then pick ALERTS from the menu.",
    placement: "center",
    mode: "action",
    completionCheck: (types) => types.has("alert-log"),
    expectedPaneType: "alert-log",
    buttonSelector: '[data-tour="split-down-video-feed"]',
    highlightSelector: '[data-tour="split-menu-alert-log"]',
    highlightColor: "danger",
  },
  {
    id: "split-right-alerts",
    targetSelector: "",
    title: "Add INTEL FEED",
    description:
      "Tap the split-right button in the ALERTS pane header, then pick INTEL FEED from the menu.",
    placement: "center",
    mode: "action",
    completionCheck: (types) => types.has("intel-feed"),
    expectedPaneType: "intel-feed",
    buttonSelector: '[data-tour="split-right-alert-log"]',
    highlightSelector: '[data-tour="split-menu-intel-feed"]',
  },
  {
    id: "save-preset",
    targetSelector: "",
    title: "Save Your Layout",
    description:
      "Tap VIEWS, type a name, and tap the save icon. Your layout is now a reusable preset.",
    placement: "center",
    mode: "action",
    completionCheck: (_types, _count, presetCount) => presetCount >= 1,
    buttonSelector: '[data-tour="views-btn"]',
    highlightSelector: '[data-tour="preset-input"]',
    tertiarySelector: '[data-tour="preset-save-btn"]',
  },
  {
    id: "mobile-complete",
    targetSelector: "",
    title: "You're All Set",
    description:
      "You've built your first layout with live video, alerts, and intel. Explore the globe, track targets, and customize your workspace. Restart the tour anytime from Settings.",
    placement: "center",
    mode: "info",
  },
];

// ── Mobile advanced steps — disabled on mobile ──────────────────────
// Advanced features (aircraft filters, watch mode, globe controls) don't
// work well on small screens. Skip the advanced tier entirely.

export const MOBILE_ADVANCED_STEPS: WalkthroughStep[] = [];

export const MOBILE_ESSENTIAL_COUNT = MOBILE_ESSENTIAL_STEPS.length;
export const MOBILE_ADVANCED_COUNT = MOBILE_ADVANCED_STEPS.length;
