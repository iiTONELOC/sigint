import {
  Download,
  HardDriveDownload,
  Layout,
  Trash2,
  Upload,
} from "lucide-react";
import { ButtonType } from "@/lib/ui/button";
import {
  settingsCacheMetadata,
  SettingsCacheGroup,
  SettingsClassName,
  SettingsIconSize,
} from "../../model";
import { formatBytes } from "../../formatters";

type StorageTabProps = Readonly<{
  confirmClearAll: boolean;
  importStatus: string | null;
  keys: readonly string[];
  onClearAll: () => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  onExport: () => Promise<void>;
  onImport: () => void;
  onResetLayout: () => Promise<void>;
  sizes: Readonly<Record<string, number>>;
  totalSize: number;
}>;

type KeyGroupProps = Readonly<{
  keys: readonly string[];
  label: string;
  onDelete: (key: string) => Promise<void>;
  sizes: Readonly<Record<string, number>>;
}>;

enum StorageClassName {
  TransferButton = "flex items-center gap-1 px-2 py-1 rounded text-xs text-sig-dim border border-sig-border/50 hover:text-sig-accent hover:border-sig-accent/30 transition-colors",
}

function keyLabel(key: string): string {
  return settingsCacheMetadata(key)?.label ?? key;
}

function KeyGroup({ keys, label, onDelete, sizes }: KeyGroupProps) {
  return (
    <div>
      <div className={SettingsClassName.CompactSectionTitle}>{label}</div>
      <div className={SettingsClassName.DataList}>
        {keys.map((key) => (
          <div key={key} className="flex items-center gap-2 px-2.5 py-2 group">
            <div className={SettingsClassName.DataText}>
              <div className="text-sm text-sig-text truncate">
                {keyLabel(key)}
              </div>
              <div className="text-xs text-sig-dim font-mono truncate">
                {key}
              </div>
            </div>
            <span className="text-xs text-sig-dim tabular-nums shrink-0">
              {formatBytes(sizes[key] ?? 0)}
            </span>
            <button
              type={ButtonType.Button}
              onClick={() => {
                onDelete(key);
              }}
              className="p-1.5 rounded text-sig-dim hover:text-sig-danger transition-all shrink-0 min-w-8 min-h-8"
              title={`Clear ${keyLabel(key)}`}
            >
              <Trash2 size={SettingsIconSize.Storage} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StorageTab({
  confirmClearAll,
  importStatus,
  keys,
  onClearAll,
  onDelete,
  onExport,
  onImport,
  onResetLayout,
  sizes,
  totalSize,
}: StorageTabProps) {
  const dataKeys = keys.filter(
    (key) => settingsCacheMetadata(key)?.group === SettingsCacheGroup.Data,
  );
  const uiKeys = keys.filter(
    (key) =>
      settingsCacheMetadata(key)?.group === SettingsCacheGroup.UserInterface,
  );
  const otherKeys = keys.filter(
    (key) => settingsCacheMetadata(key) === null,
  );

  return (
    <div className={SettingsClassName.SectionStack}>
      <div className="flex items-center flex-wrap gap-2 justify-between">
        <div className="flex items-center gap-2 text-sig-dim text-xs tracking-wider">
          <HardDriveDownload size={SettingsIconSize.Storage} />
          <span>
            {keys.length} keys · {formatBytes(totalSize)} total
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type={ButtonType.Button}
            onClick={() => {
              onExport();
            }}
            className={StorageClassName.TransferButton}
            title="Export all data as JSON"
          >
            <Download size={SettingsIconSize.Small} />
            EXPORT
          </button>
          <button
            type={ButtonType.Button}
            onClick={onImport}
            className={StorageClassName.TransferButton}
            title="Import data from JSON backup"
          >
            <Upload size={SettingsIconSize.Small} />
            IMPORT
          </button>
        </div>
      </div>

      {importStatus && (
        <div className="text-xs text-sig-accent bg-sig-accent/10 border border-sig-accent/20 rounded px-2.5 py-1.5">
          {importStatus}
        </div>
      )}

      {dataKeys.length > 0 && (
        <KeyGroup
          label="DATA CACHES"
          keys={dataKeys}
          sizes={sizes}
          onDelete={onDelete}
        />
      )}
      {uiKeys.length > 0 && (
        <KeyGroup
          label="UI STATE"
          keys={uiKeys}
          sizes={sizes}
          onDelete={onDelete}
        />
      )}
      {otherKeys.length > 0 && (
        <KeyGroup
          label="OTHER"
          keys={otherKeys}
          sizes={sizes}
          onDelete={onDelete}
        />
      )}

      <div className={SettingsClassName.DividerSection}>
        <button
          type={ButtonType.Button}
          onClick={() => {
            onResetLayout();
          }}
          className="flex items-center gap-2 px-3 py-2 rounded text-sm text-sig-dim border border-sig-border/50 hover:text-sig-text hover:border-sig-border transition-colors w-full"
        >
          <Layout size={SettingsIconSize.Standard} />
          <span className={SettingsClassName.ActionLabel}>RESET LAYOUT</span>
          <span className="text-xs ml-auto opacity-60">Reloads page</span>
        </button>
      </div>

      <div className={SettingsClassName.DividerSection}>
        <button
          type={ButtonType.Button}
          onClick={() => {
            onClearAll();
          }}
          className={`flex items-center gap-2 px-3 py-2 rounded text-sm w-full transition-all border ${
            confirmClearAll
              ? "text-sig-danger border-sig-danger/40 bg-sig-danger/10"
              : "text-sig-dim border-sig-border/50 hover:text-sig-text hover:border-sig-border"
          }`}
        >
          <Trash2 size={SettingsIconSize.Standard} />
          <span className={SettingsClassName.ActionLabel}>
            {confirmClearAll ? "CONFIRM CLEAR ALL" : "CLEAR ALL STORAGE"}
          </span>
          {confirmClearAll && (
            <span className="text-xs ml-auto">Click again to confirm</span>
          )}
        </button>
      </div>
    </div>
  );
}
