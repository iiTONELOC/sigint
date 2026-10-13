import { Placement } from "@/layout-mode/model/layoutMode";
import type { PaneType } from "@/panes/workspace";
import {
  WalkthroughRingColor,
  WalkthroughStepId,
  WalkthroughStepMode,
} from "./vocabulary";

export type WalkthroughCompletionCheck = (
  leafTypes: ReadonlySet<string>,
  leafCount: number,
  presetCount: number,
  selectedId: string | null,
  chromeHidden: boolean,
  videoPresetCount: number,
) => boolean;

export type WalkthroughStep = Readonly<{
  buttonColor?: WalkthroughRingColor;
  buttonSelector?: string;
  completionCheck?: WalkthroughCompletionCheck;
  description: string;
  expectedPaneType?: PaneType;
  highlightColor?: WalkthroughRingColor;
  highlightSelector?: string;
  id: WalkthroughStepId;
  mode: WalkthroughStepMode;
  placement: Placement;
  quaternarySelector?: string;
  targetSelector: string;
  tertiarySelector?: string;
  title: string;
}>;
