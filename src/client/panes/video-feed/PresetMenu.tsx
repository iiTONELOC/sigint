import { useState, useEffect, useRef } from "react";
import { Save, Trash2 } from "lucide-react";
import { ButtonType } from "@/lib/ui/button";
import { useWalkthroughStepId, WalkthroughStepId } from "@/walkthrough";
import { DomEvent, DomInputType, DomKey } from "@/runtime";
import type { Preset, PresetCatalog } from "./videoFeedTypes";
import { videoPresetGridLabel } from "./videoGrid";

enum VideoPresetMenuIconSize {
  Action = 14,
}

type PresetMenuProps = Readonly<{
  presets: PresetCatalog;
  onLoad: (preset: Preset) => void;
  onSave: (name: string) => void;
  onUpdate: (key: string) => void;
  onDelete: (key: string) => void;
  onClose: () => void;
}>;

export function PresetMenu({
  presets,
  onLoad,
  onSave,
  onUpdate,
  onDelete,
  onClose,
}: PresetMenuProps) {
  const [newName, setNewName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const stepId = useWalkthroughStepId();
  const presetEntries = Object.entries(presets);

  const saveNewPreset = (): void => {
    const name = newName.trim();
    if (!name) return;
    onSave(name);
    setNewName("");
    onClose();
  };

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (stepId === WalkthroughStepId.SaveVideoPreset) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current && !menuRef.current.contains(target)) {
        const toggleButton =
          target instanceof Element &&
          target.closest('[data-tour="video-preset-btn"]');
        if (toggleButton) return;
        onClose();
      }
    };
    document.addEventListener(DomEvent.MouseDown, handleDocumentMouseDown);
    return () =>
      document.removeEventListener(
        DomEvent.MouseDown,
        handleDocumentMouseDown,
      );
  }, [onClose, stepId]);

  return (
    <div
      ref={menuRef}
      data-wt-menu=""
      className="absolute right-0 top-full z-(--layer-floating) mt-0.5 bg-sig-panel border border-sig-border/60 rounded shadow-lg py-1 min-w-48"
    >
      <div className="px-2 py-1 text-sig-dim text-(length:--sig-text-sm) tracking-wider font-semibold border-b border-sig-border/30">
        PRESETS
      </div>
      {presetEntries.length === 0 && (
        <div className="px-2 py-2 text-sig-dim text-(length:--sig-text-sm)">
          No saved presets
        </div>
      )}
      {presetEntries.map(([presetKey, preset]) => (
        <div
          key={presetKey}
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
              ({videoPresetGridLabel(preset.state.grid)})
            </span>
          </button>
          <button
            type={ButtonType.Button}
            title="Update with current channels"
            onClick={() => onUpdate(presetKey)}
            className="text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors touch-target p-0.5 shrink-0 flex items-center justify-center"
          >
            <Save size={VideoPresetMenuIconSize.Action} />
          </button>
          <button
            type={ButtonType.Button}
            title="Delete preset"
            onClick={() => onDelete(presetKey)}
            className="text-sig-dim bg-transparent border-none hover:text-sig-danger transition-colors touch-target p-0.5 shrink-0 flex items-center justify-center"
          >
            <Trash2 size={VideoPresetMenuIconSize.Action} />
          </button>
        </div>
      ))}
      <div className="border-t border-sig-border/30 mt-1 pt-1 px-2 flex items-center gap-3">
        <input
          type={DomInputType.Text}
          value={newName}
          onChange={(event) => setNewName(event.currentTarget.value)}
          placeholder="Preset name..."
          data-tour="video-preset-input"
          className="flex-1 bg-transparent outline-none text-sig-bright text-(length:--sig-text-md) min-w-0 caret-sig-accent"
          onKeyDown={(event) => {
            if (event.key === DomKey.Enter) saveNewPreset();
          }}
        />
        <button
          type={ButtonType.Button}
          onClick={saveNewPreset}
          className="text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors touch-target p-0.5 shrink-0 flex items-center justify-center"
          title="Save current as preset"
          data-tour="video-preset-save-btn"
        >
          <Save size={VideoPresetMenuIconSize.Action} />
        </button>
      </div>
    </div>
  );
}
