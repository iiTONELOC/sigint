import { ExternalLink } from "lucide-react";
import { DomAnchorTarget, DomLinkRelation } from "@/runtime";
import {
  SETTINGS_ABOUT_SOURCE_METADATA,
  SettingsAboutCopy,
  SettingsAboutSource,
  SettingsClassName,
  SettingsIconSize,
} from "../../model";

export function AboutTab() {
  return (
    <div className={SettingsClassName.SectionStack}>
      <div>
        <div className={SettingsClassName.CompactSectionTitle}>
          APPLICATION
        </div>
        <div className="space-y-2 text-sm">
          <div className={SettingsClassName.DataRow}>
            <span className={SettingsClassName.DimText}>Name</span>
            <span className="text-sig-text font-semibold tracking-wider">
              {SettingsAboutCopy.ApplicationName}
            </span>
          </div>
          <div className={SettingsClassName.DataRow}>
            <span className={SettingsClassName.DimText}>Stack</span>
            <span className={SettingsClassName.StandardText}>
              {SettingsAboutCopy.ApplicationStack}
            </span>
          </div>
          <div className={SettingsClassName.DataRow}>
            <span className={SettingsClassName.DimText}>Rendering</span>
            <span className={SettingsClassName.StandardText}>
              {SettingsAboutCopy.Rendering}
            </span>
          </div>
        </div>
      </div>

      <div>
        <div className={SettingsClassName.CompactSectionTitle}>
          DATA SOURCES
        </div>
        <div className={SettingsClassName.DataList}>
          {Object.values(SettingsAboutSource).map((source) => {
            const metadata = SETTINGS_ABOUT_SOURCE_METADATA[source];
            return (
              <a
                key={source}
                href={metadata.url}
                target={DomAnchorTarget.Blank}
                rel={DomLinkRelation.NoopenerNoreferrer}
                className="flex items-center gap-2 px-2.5 py-2 text-sm text-sig-text hover:bg-sig-accent/5 transition-colors group"
              >
                <div className={SettingsClassName.DataText}>
                  <span className="text-sig-bright">{source}</span>
                  <span className="text-sig-dim ml-2">
                    {metadata.description}
                  </span>
                </div>
                <ExternalLink
                  size={SettingsIconSize.Small}
                  className="text-sig-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                />
              </a>
            );
          })}
        </div>
      </div>

      <div>
        <div className={SettingsClassName.CompactSectionTitle}>AUTHOR</div>
        <a
          href={SettingsAboutCopy.AuthorUrl}
          target={DomAnchorTarget.Blank}
          rel={DomLinkRelation.NoopenerNoreferrer}
          className="flex items-center gap-2 text-sm text-sig-accent hover:text-sig-bright transition-colors"
        >
          {SettingsAboutCopy.AuthorName}
          <ExternalLink size={SettingsIconSize.Small} />
        </a>
      </div>

      <div className={SettingsClassName.DividerSection}>
        <div className="text-xs text-sig-dim/60 leading-snug">
          Guided tours are available in the WALKTHROUGH tab.
        </div>
      </div>
    </div>
  );
}
