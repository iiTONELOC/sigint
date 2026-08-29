import { useState, useEffect, useRef } from "react";
import { Save, Trash2 } from "lucide-react";
import type { LayoutPreset } from "./paneTree";
import { leafCount } from "./paneTree";
import { useWalkthroughStepId, WalkthroughStepId } from "@/walkthrough";
import { ButtonType } from "@/lib/ui/button";
import { PaneIdSequence, PaneWorkspaceIconMetric } from "@/panes/workspace/model/pane";
import { DomEvent, DomInputType, DomKey } from "@/runtime";

type LayoutPresetRow = {
  readonly index: number;
  readonly key: string;
  readonly preset: LayoutPreset;
};

type LayoutPresetMenuProps = {
  readonly onClose: () => void;
  readonly onDelete: (index: number) => void;
  readonly onLoad: (preset: LayoutPreset) => void;
  readonly onSave: (name: string) => void;
  readonly onUpdate: (index: number) => void;
  readonly presets: readonly LayoutPreset[];
  readonly presetsLoaded?: boolean;
};

function layoutPresetRows(presets: readonly LayoutPreset[]): LayoutPresetRow[] {
  const occurrences = new Map<string, number>();
  return presets.map((preset, index) => {
    const identity = JSON.stringify([preset.name, preset.state.root.id]);
    const occurrence = occurrences.get(identity) ?? PaneIdSequence.Start;
    occurrences.set(identity, occurrence + PaneIdSequence.Step);
    return {
      index,
      key: JSON.stringify([identity, occurrence]),
      preset,
    };
  });
}

export function LayoutPresetMenu({
  presets,
  onLoad,
  onSave,
  onUpdate,
  onDelete,
  onClose,
  presetsLoaded = true,
}: LayoutPresetMenuProps) {
  const [newName, setNewName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const stepId = useWalkthroughStepId();
  const presetRows = layoutPresetRows(presets);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Don't close during walkthrough save-preset step
      if (stepId === WalkthroughStepId.SavePreset) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        const toggle = (e.target as HTMLElement).closest(
          '[data-tour="views-btn"]',
        );
        if (toggle) return;
        onClose();
      }
    };
    document.addEventListener(DomEvent.MouseDown, handler);
    return () => document.removeEventListener(DomEvent.MouseDown, handler);
  }, [onClose, stepId]);

  const paneCount = (p: LayoutPreset) => {
    const count = leafCount(p.state.root);
    const min = p.state.minimized.length;
    return min > 0 ? `${count}+${min}` : `${count}`;
  };

  const saveNewPreset = () => {
    const name = newName.trim();
    if (!name) return;
    onSave(name);
    setNewName("");
    onClose();
  };

  const menu = (
    <div
      ref={menuRef}
      data-wt-menu=""
      className="absolute right-0 top-full mt-0.5 z-(--layer-menu) bg-sig-panel border border-sig-border/60 rounded shadow-lg py-1 min-w-52"
    >
      <div className="px-2 py-1 text-sig-dim text-[10px] tracking-wider font-semibold border-b border-sig-border/30">
        LAYOUT PRESETS
      </div>
      {presetsLoaded && presets.length === 0 && (
        <div className="px-2 py-2 text-sig-dim text-(length:--sig-text-sm)">
          No saved presets
        </div>
      )}
      {presetRows.map(({ index, key, preset }) => (
        <div
          key={key}
          className="flex items-center gap-1 px-2 py-1 hover:bg-sig-accent/10 transition-colors"
        >
          <button
            type={ButtonType.Button}
            onClick={() => {
              onLoad(preset);
              onClose();
            }}
            className="flex-1 text-left text-sig-bright text-(length:--sig-text-md) bg-transparent border-none truncate"
          >
            {preset.name}
            <span className="text-sig-dim ml-1">
              ({paneCount(preset)} panes)
            </span>
          </button>
          <button
            type={ButtonType.Button}
            title="Update with current layout"
            onClick={() => onUpdate(index)}
            className="text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors touch-target p-0.5 shrink-0 flex items-center justify-center"
          >
            <Save size={PaneWorkspaceIconMetric.LargeSize} />
          </button>
          <button
            type={ButtonType.Button}
            title="Delete preset"
            onClick={() => onDelete(index)}
            className="text-sig-dim bg-transparent border-none hover:text-sig-danger transition-colors touch-target p-0.5 shrink-0 flex items-center justify-center"
          >
            <Trash2 size={PaneWorkspaceIconMetric.LargeSize} />
          </button>
        </div>
      ))}
      <div className="border-t border-sig-border/30 mt-1 pt-1 px-2 flex items-center gap-3">
        <input
          type={DomInputType.Text}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Preset name..."
          data-tour="preset-input"
          className="flex-1 bg-transparent outline-none text-sig-bright text-(length:--sig-text-md) min-w-0 caret-sig-accent"
          onKeyDown={(e) => {
            if (e.key === DomKey.Enter) saveNewPreset();
          }}
        />
        <button
          type={ButtonType.Button}
          onClick={saveNewPreset}
          className="text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors touch-target p-0.5 shrink-0 flex items-center justify-center"
          title="Save current layout as preset"
          data-tour="preset-save-btn"
        >
          <Save size={PaneWorkspaceIconMetric.LargeSize} />
        </button>
      </div>
    </div>
  );

  return menu;
}
