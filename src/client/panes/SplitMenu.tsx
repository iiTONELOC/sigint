import { forwardRef } from "react";
import { createPortal } from "react-dom";
import type { PaneType } from "./paneTree";
import type { PaneCatalog } from "@/panes/workspace/paneCatalog";

type SplitMenuProps = {
  readonly types: PaneType[];
  readonly catalog: PaneCatalog;
  readonly top: number;
  readonly left: number;
  readonly onSelect: (type: PaneType) => void;
  /** Optional data-wt-menu attribute for walkthrough detection */
  readonly wtMenu?: boolean;
  /** Optional className override for the container */
  readonly className?: string;
};

/**
 * Dropdown menu of available pane types for split/add operations.
 * Used by both PaneManager (desktop) and PaneMobile.
 * Renders via portal to document.body.
 */
export const SplitMenu = forwardRef<HTMLDivElement, SplitMenuProps>(
  function SplitMenu(
    { types, catalog, top, left, onSelect, wtMenu, className },
    ref,
  ) {
    return createPortal(
      <div
        ref={ref}
        {...(wtMenu ? { "data-wt-menu": "" } : {})}
        className={
          className ??
          "fixed z-80 rounded overflow-hidden bg-sig-panel/96 border border-sig-border backdrop-blur-md min-w-36"
        }
        style={{
          top,
          left: Math.max(8, Math.min(left, window.innerWidth - 200)),
        }}
      >
        {types.map((type) => {
          const definition = catalog[type];
          const Icon = definition.icon;
          return (
            <button
              key={type}
              data-tour={`split-menu-${type}`}
              onClick={() => onSelect(type)}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2 text-sig-text text-(length:--sig-text-md) bg-transparent border-none hover:bg-sig-accent/10 transition-colors min-h-11"
            >
              <Icon size={14} strokeWidth={2.5} className="text-sig-accent" />
              {definition.label}
            </button>
          );
        })}
      </div>,
      document.body,
    );
  },
);
