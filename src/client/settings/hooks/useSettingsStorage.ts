import { useCallback, useEffect, useState } from "react";
import {
  cacheClearAll,
  cacheDelete,
  cacheEstimateSize,
  cacheListKeys,
} from "@/lib/cache";
import { ClientErrorMessage } from "@/errors";
import { DomElementTag, DomInputType } from "@/runtime";
import { CacheKey } from "@shared/domain/cache";
import { SettingsTiming } from "../model";
import {
  exportSettingsBackup,
  importSettingsBackup,
  SettingsImportError,
} from "../utils";

enum SettingsImportFileType {
  Json = ".json",
}

const LAYOUT_RESET_CACHE_KEYS: readonly CacheKey[] = [
  CacheKey.LayoutLegacy, // NOSONAR typescript:S1874: Reset removes stored legacy layout data.
  CacheKey.LayoutDesktop,
  CacheKey.LayoutMobile,
  CacheKey.LayoutPresetsLegacy, // NOSONAR typescript:S1874: Reset removes stored legacy preset data.
  CacheKey.LayoutPresetsDesktopLegacy, // NOSONAR typescript:S1874: Reset removes stored legacy desktop presets.
  CacheKey.LayoutPresetsMobileLegacy, // NOSONAR typescript:S1874: Reset removes stored legacy mobile presets.
];

type SettingsStorageState = Readonly<{
  confirmClearAll: boolean;
  importStatus: string | null;
  sizes: Readonly<Record<string, number>>;
  storageKeys: readonly string[];
  totalSize: number;
}>;

type SettingsStorageActions = Readonly<{
  clearAll: () => Promise<void>;
  deleteKey: (key: string) => Promise<void>;
  exportData: () => Promise<void>;
  importData: () => void;
  resetLayout: () => Promise<void>;
}>;

export type SettingsStorage = Readonly<{
  actions: SettingsStorageActions;
  state: SettingsStorageState;
}>;

export function useSettingsStorage(): SettingsStorage {
  const [storageKeys, setStorageKeys] = useState<string[]>([]);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const refreshStorage = useCallback(async () => {
    const keys = await cacheListKeys();
    const nextSizes: Record<string, number> = {};
    for (const key of keys) {
      nextSizes[key] = await cacheEstimateSize(key);
    }
    setStorageKeys(keys);
    setSizes(nextSizes);
  }, []);

  useEffect(() => {
    refreshStorage();
  }, [refreshStorage]);

  const deleteKey = useCallback(
    async (key: string) => {
      await cacheDelete(key);
      await refreshStorage();
    },
    [refreshStorage],
  );

  const clearAll = useCallback(async () => {
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      return;
    }
    await cacheClearAll();
    window.location.reload();
  }, [confirmClearAll]);

  const resetLayout = useCallback(async () => {
    for (const key of LAYOUT_RESET_CACHE_KEYS) {
      await cacheDelete(key);
    }
    window.location.reload();
  }, []);

  const importData = useCallback(() => {
    const input = document.createElement(DomElementTag.Input);
    input.type = DomInputType.File;
    input.accept = SettingsImportFileType.Json;
    input.onchange = async () => {
      const file = input.files?.item(0);
      if (!file) return;
      try {
        setImportStatus(await importSettingsBackup(file));
        await refreshStorage();
        setTimeout(
          () => window.location.reload(),
          SettingsTiming.ImportReloadDelayMs,
        );
      } catch (error) {
        const message =
          error instanceof SettingsImportError
            ? error.messageKind
            : ClientErrorMessage.SettingsImportParseFailed;
        setImportStatus(message);
        setTimeout(
          () => setImportStatus(null),
          SettingsTiming.ImportErrorClearDelayMs,
        );
      }
    };
    input.click();
  }, [refreshStorage]);

  const totalSize = Object.values(sizes).reduce(
    (total, size) => total + size,
    0,
  );

  return {
    actions: {
      clearAll,
      deleteKey,
      exportData: exportSettingsBackup,
      importData,
      resetLayout,
    },
    state: {
      confirmClearAll,
      importStatus,
      sizes,
      storageKeys,
      totalSize,
    },
  };
}
