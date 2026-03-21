import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Save, Trash2, Pencil } from "lucide-react";
import type { LayoutPreset } from "./paneTree";
import { leafCount } from "./paneTree";

export function LayoutPresetMenu({
  presets,
  onLoad,
  onSave,
  onUpdate,
  onDelete,
  onClose,
  presetsLoaded = true,
  anchorRect,
}: {
  presets: LayoutPreset[];
  onLoad: (p: LayoutPreset) => void;
  onSave: (name: string) => void;
  onUpdate: (idx: number) => void;
  onDelete: (idx: number) => void;
  onClose: () => void;
  presetsLoaded?: boolean;
  anchorRect?: DOMRect | null;
}) {
  const [newName, setNewName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const paneCount = (p: LayoutPreset) => {
    const count = leafCount(p.state.root);
    const min = p.state.minimized.length;
    return min > 0 ? `${count}+${min}` : `${count}`;
  };

  const posStyle: React.CSSProperties = anchorRect
    ? {
        top: anchorRect.bottom + 2,
        right: window.innerWidth - anchorRect.right,
      }
    : {};

  const menu = (
    <div
      ref={menuRef}
      className={`${anchorRect ? "fixed" : "absolute right-0 top-full mt-0.5"} z-[80] bg-sig-panel border border-sig-border/60 rounded shadow-lg py-1 min-w-52`}
      style={posStyle}
    >
      <div className="px-2 py-1 text-sig-dim text-[10px] tracking-wider font-semibold border-b border-sig-border/30">
        LAYOUT PRESETS
      </div>
      {presetsLoaded && presets.length === 0 && (
        <div className="px-2 py-2 text-sig-dim text-(length:--sig-text-sm)">
          No saved presets
        </div>
      )}
      {presets.map((p, i) => (
        <div
          key={i}
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
            <span className="text-sig-dim ml-1">({paneCount(p)} panes)</span>
          </button>
          <button
            title="Update with current layout"
            onClick={() => onUpdate(i)}
            className="text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors p-0.5 shrink-0"
          >
            <Pencil size={10} />
          </button>
          <button
            title="Delete preset"
            onClick={() => onDelete(i)}
            className="text-sig-dim bg-transparent border-none hover:text-sig-danger transition-colors p-0.5 shrink-0"
          >
            <Trash2 size={10} />
          </button>
        </div>
      ))}
      <div className="border-t border-sig-border/30 mt-1 pt-1 px-2 flex items-center gap-1">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Preset name..."
          className="flex-1 bg-transparent outline-none text-sig-bright text-(length:--sig-text-md) min-w-0 caret-sig-accent"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
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
          className="text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors p-0.5 shrink-0"
          title="Save current layout as preset"
        >
          <Save size={11} />
        </button>
      </div>
    </div>
  );

  return anchorRect ? createPortal(menu, document.body) : menu;
}
