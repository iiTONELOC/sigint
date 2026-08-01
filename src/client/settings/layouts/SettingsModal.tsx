import { useEffect, useState } from "react";
import {
  BookOpen,
  Database,
  Info,
  Palette,
  Rss,
  X,
} from "lucide-react";
import { useTheme } from "@/theme";
import { ButtonType } from "@/lib/ui/button";
import { DomEvent, DomKey } from "@/runtime";
import {
  AboutTab,
  AppearanceTab,
  NewsFeedsTab,
  StorageTab,
  WalkthroughTab,
} from "../components/tabs";
import { useSettingsStorage } from "../hooks";
import {
  SettingsIconSize,
  SettingsIconStrokeWidth,
  SettingsTab,
} from "../model";

type SettingsModalProps = Readonly<{
  onClose: () => void;
}>;

type SettingsTabMetadata = Readonly<{
  icon: typeof Palette;
  label: string;
}>;

enum SettingsModalElementId {
  Title = "settings-modal-title",
}

enum SettingsModalLabel {
  Close = "Close settings",
}

enum SettingsModalMetric {
  BackdropTabIndex = -1,
}

const SETTINGS_TAB_METADATA: Readonly<
  Record<SettingsTab, SettingsTabMetadata>
> = {
  [SettingsTab.Appearance]: { icon: Palette, label: "APPEARANCE" },
  [SettingsTab.News]: { icon: Rss, label: "NEWS FEEDS" },
  [SettingsTab.Walkthrough]: { icon: BookOpen, label: "WALKTHROUGH" },
  [SettingsTab.Storage]: { icon: Database, label: "STORAGE" },
  [SettingsTab.About]: { icon: Info, label: "ABOUT" },
};

export function SettingsModal({ onClose }: SettingsModalProps) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(SettingsTab.Appearance);
  const { actions, state } = useSettingsStorage();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === DomKey.Escape) onClose();
    };
    document.addEventListener(DomEvent.KeyDown, handleKeyDown);
    return () => document.removeEventListener(DomEvent.KeyDown, handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center overscroll-none touch-none">
      <button
        type={ButtonType.Button}
        aria-label={SettingsModalLabel.Close}
        tabIndex={SettingsModalMetric.BackdropTabIndex}
        onClick={onClose}
        className="absolute inset-0 w-full h-full bg-black/60 backdrop-blur-sm cursor-default"
      />
      <dialog
        open
        aria-modal="true"
        aria-labelledby={SettingsModalElementId.Title}
        className="relative m-0 p-0 border-0 bg-sig-panel text-inherit sm:border sm:border-sig-border sm:rounded-lg shadow-2xl w-full h-full sm:w-auto sm:min-w-md sm:max-w-lg sm:mx-4 sm:h-auto sm:max-h-[85vh] flex flex-col overflow-hidden pt-[env(safe-area-inset-top)]"
      >
        <div className="relative flex items-center justify-center px-3 sm:px-4 py-3 border-b border-sig-border/50">
          <span
            id={SettingsModalElementId.Title}
            className="font-semibold tracking-widest text-sig-bright text-sm"
          >
            SETTINGS
          </span>
          <button
            type={ButtonType.Button}
            onClick={onClose}
            aria-label={SettingsModalLabel.Close}
            className="absolute right-3 sm:right-4 p-1.5 rounded text-sig-dim hover:text-sig-bright transition-colors min-w-11 min-h-11"
          >
            <X size={SettingsIconSize.Large} />
          </button>
        </div>

        <div className="flex items-center justify-center flex-wrap gap-0.5 px-2 sm:px-4 pt-2 pb-0 border-b border-sig-border/30">
          {Object.values(SettingsTab).map((tab) => {
            const metadata = SETTINGS_TAB_METADATA[tab];
            const Icon = metadata.icon;
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type={ButtonType.Button}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-semibold tracking-wider transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  active
                    ? "text-sig-accent border-sig-accent"
                    : "text-sig-dim border-transparent hover:text-sig-text"
                }`}
              >
                <Icon
                  size={SettingsIconSize.Storage}
                  strokeWidth={SettingsIconStrokeWidth.Standard}
                />
                {metadata.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain sigint-scroll p-3 sm:p-4 touch-pan-y [-webkit-overflow-scrolling:touch]">
          {activeTab === SettingsTab.Appearance && (
            <AppearanceTab
              mode={theme.mode}
              resolvedMode={theme.resolvedMode}
              setMode={theme.setMode}
              colorOverrides={theme.colorOverrides}
              setLayerColor={theme.setLayerColor}
              resetLayerColor={theme.resetLayerColor}
              resetAllColors={theme.resetAllColors}
            />
          )}
          {activeTab === SettingsTab.News && <NewsFeedsTab />}
          {activeTab === SettingsTab.Walkthrough && (
            <WalkthroughTab onClose={onClose} />
          )}
          {activeTab === SettingsTab.Storage && (
            <StorageTab
              keys={state.storageKeys}
              sizes={state.sizes}
              totalSize={state.totalSize}
              onDelete={actions.deleteKey}
              onClearAll={actions.clearAll}
              confirmClearAll={state.confirmClearAll}
              onResetLayout={actions.resetLayout}
              onExport={actions.exportData}
              onImport={actions.importData}
              importStatus={state.importStatus}
            />
          )}
          {activeTab === SettingsTab.About && <AboutTab />}
        </div>
      </dialog>
    </div>
  );
}
