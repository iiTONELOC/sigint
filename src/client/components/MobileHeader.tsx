import { useEffect, useState } from "react";
import { Satellite, SlidersHorizontal, X } from "lucide-react";
import { useDataContext } from "@/context/DataContext";
import { isSourceDelivering } from "@shared/domain/sourceStatus";
import type { SourceStatusEntry } from "@/lib/net/sourceHealth";
import { ButtonType } from "@/lib/ui/button";
import { DomEvent, DomKey } from "@/runtime";
import { SettingsModal } from "@/settings";
import {
  HeaderBrand,
  HeaderIconSize,
  LayoutModeToggle,
  SettingsButton,
  Toggles,
  type HeaderProps,
} from "./Header";

enum MobileHeaderLabel {
  Close = "Close layers and counts",
  Filters = "FILTERS",
  Layout = "LAYOUT",
  Live = "LIVE",
  Open = "Open layers and counts",
  Title = "LAYERS AND COUNTS",
  Tracks = "TRACKS",
}

enum MobileHeaderClassName {
  Row = "flex items-center justify-between",
  SheetLabel = "text-(length:--sig-text-xs) font-semibold tracking-widest text-sig-dim",
}

enum MobileHeaderBackdrop {
  TabIndex = -1,
}

function TrackSummary({ dataSources }: Readonly<{ dataSources: readonly SourceStatusEntry[] }>) {
  const { activeCount } = useDataContext();
  const live = dataSources.filter((source) => isSourceDelivering(source.status)).length;
  return (
    <div className="flex items-center gap-2 text-(length:--sig-text-sm)">
      <Satellite size={HeaderIconSize.Compact} className="text-sig-accent shrink-0" aria-hidden />
      <span className="text-sig-accent font-semibold tabular-nums">{activeCount.toLocaleString()}</span>
      <span className="text-sig-dim tracking-wider">{MobileHeaderLabel.Tracks}</span>
      <span className="text-sig-dim">· {live}/{dataSources.length} {MobileHeaderLabel.Live}</span>
    </div>
  );
}

function FiltersSheet({ headerProps, onClose }: Readonly<{ headerProps: HeaderProps; onClose: () => void }>) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === DomKey.Escape) onClose();
    };
    document.addEventListener(DomEvent.KeyDown, closeOnEscape);
    return () => document.removeEventListener(DomEvent.KeyDown, closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-(--layer-modal) flex flex-col justify-end">
      <button
        type={ButtonType.Button}
        aria-label={MobileHeaderLabel.Close}
        tabIndex={MobileHeaderBackdrop.TabIndex}
        onClick={onClose}
        className="absolute inset-0 w-full h-full bg-black/60 cursor-default"
      />
      <dialog
        open
        aria-modal="true"
        aria-label={MobileHeaderLabel.Title}
        className="relative m-0 w-full max-w-none border-0 border-t border-sig-border rounded-t-2xl bg-sig-panel text-inherit px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-3"
      >
        <div className={MobileHeaderClassName.Row}>
          <span className={MobileHeaderClassName.SheetLabel}>{MobileHeaderLabel.Title}</span>
          <button
            type={ButtonType.Button}
            onClick={onClose}
            aria-label={MobileHeaderLabel.Close}
            className="touch-target flex items-center justify-center rounded text-sig-dim hover:text-sig-bright"
          >
            <X size={HeaderIconSize.Compact} aria-hidden />
          </button>
        </div>
        <Toggles {...headerProps} searchSlot={undefined} countsVisible />
        <TrackSummary dataSources={headerProps.dataSources} />
        <div className={MobileHeaderClassName.Row}>
          <span className={MobileHeaderClassName.SheetLabel}>{MobileHeaderLabel.Layout}</span>
          <LayoutModeToggle />
        </div>
      </dialog>
    </div>
  );
}

export function MobileHeader(props: Readonly<HeaderProps>) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="shrink-0 border-b border-sig-border bg-sig-panel/95">
      <div className="flex items-center gap-2 px-2 py-1">
        <HeaderBrand />
        <div className="flex-1 min-w-0 flex justify-end">{props.searchSlot}</div>
        <button
          type={ButtonType.Button}
          onClick={() => setFiltersOpen(true)}
          aria-label={MobileHeaderLabel.Open}
          className="touch-target flex items-center gap-1 px-2 py-1 rounded border border-sig-border text-sig-dim hover:text-sig-accent text-(length:--sig-text-btn) font-semibold tracking-wide"
        >
          <SlidersHorizontal size={HeaderIconSize.Compact} aria-hidden />
          {MobileHeaderLabel.Filters}
        </button>
        <SettingsButton iconSize={HeaderIconSize.Compact} onOpen={() => setSettingsOpen(true)} showTooltip={false} />
      </div>
      {filtersOpen && <FiltersSheet headerProps={props} onClose={() => setFiltersOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
