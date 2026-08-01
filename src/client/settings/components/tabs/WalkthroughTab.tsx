import { useCallback, useEffect, useState } from "react";
import { BookOpen, RotateCcw } from "lucide-react";
import { cacheDelete, cacheGet } from "@/lib/cache";
import { ButtonType } from "@/lib/ui/button";
import {
  requestWalkthroughLaunch,
  WalkthroughLaunchMode,
} from "@/walkthrough";
import { CacheKey } from "@shared/domain/cache";
import {
  SettingsClassName,
  SettingsIconSize,
  SettingsTiming,
} from "../../model";

type WalkthroughTabProps = Readonly<{
  onClose: () => void;
}>;

type WalkthroughOption = Readonly<{
  description: string;
  iconClassName: string;
  label: string;
}>;

enum WalkthroughTabClassName {
  LaunchButton = "flex items-center gap-2 px-3 py-2.5 rounded text-sm text-sig-text border border-sig-border/50 hover:text-sig-accent hover:border-sig-accent/30 transition-colors w-full",
  LaunchDescription = "text-xs text-sig-dim ml-2",
  LaunchText = "flex-1 text-left",
}

const WALKTHROUGH_OPTIONS: Readonly<
  Record<WalkthroughLaunchMode, WalkthroughOption>
> = {
  [WalkthroughLaunchMode.Both]: {
    description: "Essentials + Advanced",
    iconClassName: "text-sig-accent shrink-0",
    label: "FULL TOUR",
  },
  [WalkthroughLaunchMode.Essential]: {
    description: "Globe, panes, presets",
    iconClassName: SettingsClassName.DimIcon,
    label: "ESSENTIALS ONLY",
  },
  [WalkthroughLaunchMode.Advanced]: {
    description: "Watch mode, filters, settings",
    iconClassName: SettingsClassName.DimIcon,
    label: "ADVANCED ONLY",
  },
};

export function WalkthroughTab({ onClose }: WalkthroughTabProps) {
  const [completionStatus, setCompletionStatus] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    cacheGet<boolean>(CacheKey.WalkthroughComplete).then((done) => {
      setCompletionStatus(done ?? false);
    });
  }, []);

  const launch = useCallback(
    (mode: WalkthroughLaunchMode) => {
      onClose();
      setTimeout(
        () => requestWalkthroughLaunch(mode),
        SettingsTiming.WalkthroughLaunchDelayMs,
      );
    },
    [onClose],
  );

  const handleResetCompletion = useCallback(async () => {
    await cacheDelete(CacheKey.WalkthroughComplete);
    setCompletionStatus(false);
  }, []);

  return (
    <div className={SettingsClassName.SectionStack}>
      <div>
        <div className={SettingsClassName.CompactSectionTitle}>
          GUIDED TOURS
        </div>
        <div className="text-xs text-sig-dim/70 mb-3 leading-snug">
          Interactive walkthroughs guide you through SIGINT features. You can
          replay each tour at any time.
        </div>
        <div className="space-y-2">
          {Object.values(WalkthroughLaunchMode).map((mode) => {
            const option = WALKTHROUGH_OPTIONS[mode];
            return (
              <button
                key={mode}
                type={ButtonType.Button}
                onClick={() => launch(mode)}
                className={WalkthroughTabClassName.LaunchButton}
              >
                <BookOpen
                  size={SettingsIconSize.Standard}
                  className={option.iconClassName}
                />
                <div className={WalkthroughTabClassName.LaunchText}>
                  <span className={SettingsClassName.ActionLabel}>
                    {option.label}
                  </span>
                  <span className={WalkthroughTabClassName.LaunchDescription}>
                    {option.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={SettingsClassName.DividerSection}>
        <div className={SettingsClassName.CompactSectionTitle}>
          COMPLETION STATUS
        </div>
        <div className="flex items-center gap-2 px-2.5 py-2 rounded bg-sig-bg/30 border border-sig-border/20">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              completionStatus ? "bg-sig-accent" : "bg-sig-dim/40"
            }`}
          />
          <span className="text-sm text-sig-text flex-1">
            {completionStatus ? "Tour completed" : "Tour not completed"}
          </span>
          {completionStatus && (
            <button
              type={ButtonType.Button}
              onClick={() => {
                handleResetCompletion();
              }}
              className="flex items-center gap-1 text-xs text-sig-dim hover:text-sig-accent transition-colors"
            >
              <RotateCcw size={SettingsIconSize.Tiny} />
              RESET
            </button>
          )}
        </div>
        <div className={SettingsClassName.SupportingText}>
          Resetting lets the tour start automatically on the next visit. You
          can also replay a tour with the buttons above.
        </div>
      </div>
    </div>
  );
}
