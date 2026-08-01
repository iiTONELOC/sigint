import { useState, useEffect, useRef } from "react";
import { Save, Trash2 } from "lucide-react";
import { useWalkthroughStepId, WalkthroughStepId } from "@/walkthrough";
import { DomEvent, DomKey } from "@/runtime";
import type { Preset } from "./videoFeedTypes";
import { videoPresetGridLabel } from "./videoGrid";

enum VideoPresetMenuIconSize {
  Action = 14,
}

type PresetMenuProps = Readonly<{
  presets: Preset[];
  onLoad: (preset: Preset) => void;
  onSave: (name: string) => void;
  onUpdate: (index: number) => void;
  onDelete: (index: number) => void;
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Don't close during walkthrough save-video-preset step
      if (stepId === WalkthroughStepId.SaveVideoPreset) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        const toggle = (e.target as HTMLElement).closest(
          '[data-tour="video-preset-btn"]',
        );
        if (toggle) return;
        onClose();
      }
    };
    document.addEventListener(DomEvent.MouseDown, handler);
    return () => document.removeEventListener(DomEvent.MouseDown, handler);
  }, [onClose, stepId]);

  return (
    <div
      ref={menuRef}
      data-wt-menu=""
      className="absolute right-0 top-full z-30 mt-0.5 bg-sig-panel border border-sig-border/60 rounded shadow-lg py-1 min-w-48"
    >
      <div className="px-2 py-1 text-sig-dim text-[10px] tracking-wider font-semibold border-b border-sig-border/30">
        PRESETS
      </div>
      {presets.length === 0 && (
        <div className="px-2 py-2 text-sig-dim text-(length:--sig-text-sm)">
          No saved presets
        </div>
      )}
      {presets.map((p, i) => (
        <div
          key={i /* NOSONAR: Preset order owns update and delete identity. */}
          className="flex items-center gap-1 px-2 py-1 hover:bg-sig-accent/10 transition-colors"
        >
          <button
            onClick={() => {
              onLoad(p);
              onClose();
            }}
            className="flex-1 text-left text-sig-bright text-(length:--sig-text-md) bg-transparent border-none truncate"
          >
            {p.name}
            <span className="text-sig-dim ml-1">
              ({videoPresetGridLabel(p.state.grid)})
            </span>
          </button>
          <button
            title="Update with current channels"
            onClick={() => onUpdate(i)}
            className="text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors touch-target p-0.5 shrink-0 flex items-center justify-center"
          >
            <Save size={VideoPresetMenuIconSize.Action} />
          </button>
          <button
            title="Delete preset"
            onClick={() => onDelete(i)}
            className="text-sig-dim bg-transparent border-none hover:text-sig-danger transition-colors touch-target p-0.5 shrink-0 flex items-center justify-center"
          >
            <Trash2 size={VideoPresetMenuIconSize.Action} />
          </button>
        </div>
      ))}
      <div className="border-t border-sig-border/30 mt-1 pt-1 px-2 flex items-center gap-3">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Preset name..."
          data-tour="video-preset-input"
          className="flex-1 bg-transparent outline-none text-sig-bright text-(length:--sig-text-md) min-w-0 caret-sig-accent"
          onKeyDown={(e) => {
            if (e.key === DomKey.Enter && newName.trim()) {
              onSave(newName.trim());
              setNewName("");
              onClose();
            }
          }}
        />
        <button
          onClick={() => {
            if (newName.trim()) {
              onSave(newName.trim());
              setNewName("");
              onClose();
            }
          }}
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
