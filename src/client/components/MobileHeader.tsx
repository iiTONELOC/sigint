import { useState } from "react";
import { Satellite, SlidersHorizontal } from "lucide-react";
import { useDataContext } from "@/context/DataContext";
import { isSourceDelivering } from "@shared/domain/sourceStatus";
import type { SourceStatusEntry } from "@/lib/net/sourceHealth";
import { ButtonType } from "@/lib/ui/button";
import { SettingsModal } from "@/settings";
import {
  HeaderBrand,
  HeaderIconSize,
  HeaderTourTarget,
  LayoutModeToggle,
  SettingsButton,
  Toggles,
  type HeaderProps,
} from "./Header";
import { MobileSheet, MobileSheetClassName } from "./MobileSheet";

enum MobileHeaderClassName {
  Row = "flex items-center gap-2 grow min-w-0",
  SlotClosed = "flex-1 min-w-0 flex justify-end",
  SlotOpen = "flex-1 min-w-0",
}

enum MobileHeaderLabel {
  Close = "Close layers and counts",
  Filters = "FILTERS",
  Layout = "LAYOUT",
  Live = "LIVE",
  Open = "Open layers and counts",
  Title = "LAYERS AND COUNTS",
  Tracks = "TRACKS",
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
  return (
    <MobileSheet
      closeLabel={MobileHeaderLabel.Close}
      label={MobileHeaderLabel.Title}
      onClose={onClose}
    >
      <Toggles {...headerProps} searchSlot={undefined} countsVisible grid />
      <TrackSummary dataSources={headerProps.dataSources} />
      <div className={MobileSheetClassName.Row}>
        <span className={MobileSheetClassName.Label}>{MobileHeaderLabel.Layout}</span>
        <LayoutModeToggle labelled />
      </div>
    </MobileSheet>
  );
}

export function MobileHeader(props: Readonly<HeaderProps & { searchOpen?: boolean }>) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchOpen = props.searchOpen ?? false;

  return (
    <div className={MobileHeaderClassName.Row}>
      {!searchOpen && <HeaderBrand subtitle={false} />}
      <div className={searchOpen ? MobileHeaderClassName.SlotOpen : MobileHeaderClassName.SlotClosed}>{props.searchSlot}</div>
      {!searchOpen && (
      <button
        type={ButtonType.Button}
        onClick={() => setFiltersOpen(true)}
        aria-label={MobileHeaderLabel.Open}
        data-tour={HeaderTourTarget.LayerToggles}
        className="touch-target flex items-center gap-1 px-2 py-1 rounded border border-sig-border text-sig-dim hover:text-sig-accent text-(length:--sig-text-btn) font-semibold tracking-wide"
      >
        <SlidersHorizontal size={HeaderIconSize.Compact} aria-hidden />
        {MobileHeaderLabel.Filters}
      </button>
      )}
      {!searchOpen && (
        <SettingsButton iconSize={HeaderIconSize.Compact} onOpen={() => setSettingsOpen(true)} showTooltip={false} />
      )}
      {filtersOpen && <FiltersSheet headerProps={props} onClose={() => setFiltersOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
