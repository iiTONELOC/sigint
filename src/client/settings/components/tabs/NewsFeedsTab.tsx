import { useCallback } from "react";
import { Rss, Trash2 } from "lucide-react";
import { cacheDelete } from "@/lib/cache";
import { ButtonType } from "@/lib/ui/button";
import { CacheKey } from "@shared/domain/cache";
import { NewsSource } from "@shared/domain/newsSource";
import { SettingsClassName, SettingsIconSize } from "../../model/presentation";
import { SettingsNewsCopy } from "../../model/about";

export function NewsFeedsTab() {
  const handleClearCache = useCallback(async () => {
    await cacheDelete(CacheKey.News);
    window.location.reload();
  }, []);

  return (
    <div className={SettingsClassName.SectionStack}>
      <div>
        <div className={SettingsClassName.CompactSectionTitle}>
          DEFAULT SOURCES
        </div>
        <div className="text-xs text-sig-dim/70 mb-2 leading-snug">
          {SettingsNewsCopy.Polling}
        </div>
        <div className={SettingsClassName.DataList}>
          {Object.values(NewsSource).map((source) => (
            <div key={source} className="flex items-center gap-2 px-2 py-2">
              <Rss
                size={SettingsIconSize.News}
                className="text-sig-dim shrink-0"
              />
              <span className="text-sm font-mono tracking-wider flex-1 text-sig-text">
                {source}
              </span>
              <span className="text-xs text-sig-dim tracking-wider">RSS</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className={SettingsClassName.CompactSectionTitle}>CACHE</div>
        <div className="flex items-center flex-wrap gap-2">
          <button
            type={ButtonType.Button}
            onClick={() => {
              handleClearCache();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold tracking-wider text-sig-dim border border-sig-border/50 hover:text-sig-danger hover:border-sig-danger/30 transition-colors"
          >
            <Trash2 size={SettingsIconSize.Small} />
            CLEAR NEWS CACHE
          </button>
          <span className="text-xs text-sig-dim/60">
            {SettingsNewsCopy.CacheDuration}
          </span>
        </div>
      </div>
    </div>
  );
}
