import { forwardRef } from "react";
import { createPortal } from "react-dom";
import type { PaneType } from "./paneTree";
import type { PaneCatalog } from "@/panes/workspace/paneCatalog";
import { ButtonType } from "@/lib/ui/button";
import { PaneWorkspaceIconMetric, PaneWorkspaceMenuMetric } from "@/panes/workspace/model/pane";

enum SplitMenuMetric {
  BoundaryPaddingPx = 8,
}

type SplitMenuProps = {
  readonly types: PaneType[];
  readonly catalog: PaneCatalog;
  readonly top: number;
  readonly left: number;
  readonly onSelect: (type: PaneType) => void;
  readonly wtMenu?: boolean;
  readonly className?: string;
};

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
          "fixed z-(--layer-menu) rounded overflow-hidden bg-sig-panel/96 border border-sig-border backdrop-blur-md min-w-36"
        }
        style={{
          top,
          left: Math.max(
            SplitMenuMetric.BoundaryPaddingPx,
            Math.min(
              left,
              window.innerWidth - PaneWorkspaceMenuMetric.BoundaryWidth,
            ),
          ),
        }}
      >
        {types.map((type) => {
          const definition = catalog[type];
          const Icon = definition.icon;
          return (
            <button
              type={ButtonType.Button}
              key={type}
              data-tour={`split-menu-${type}`}
              onClick={() => onSelect(type)}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2 text-sig-text text-(length:--sig-text-md) bg-transparent border-none hover:bg-sig-accent/10 transition-colors min-h-11"
            >
              <Icon
                size={PaneWorkspaceIconMetric.LargeSize}
                strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                className="text-sig-accent"
              />
              {definition.label}
            </button>
          );
        })}
      </div>,
      document.body,
    );
  },
);
