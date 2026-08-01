import {
  cacheGet,
  cacheListKeys,
  cacheSet,
} from "@/lib/cache";
import { DomElementTag } from "@/runtime";
import { CacheKey, isCacheKey } from "@shared/domain/cache";
import { isRecord } from "@shared/geo";
import { ClientErrorMessage } from "@/errors";

enum SettingsBackupFormat {
  DownloadPrefix = "sigint-backup-",
  Extension = ".json",
  MimeType = "application/json",
}

enum SettingsTransferPolicy {
  DateStart = 0,
  JsonIndent = 2,
  DateEnd = 10,
  MaximumImportBytes = 52_428_800,
}

enum SettingsImportStatusText {
  Imported = "Imported",
  Key = "key",
  Keys = "keys",
  Skipped = "skipped",
}

export class SettingsImportError extends Error {
  constructor(readonly messageKind: ClientErrorMessage) {
    super(messageKind);
    this.name = SettingsImportError.name;
  }
}

function importStatus(imported: number, skipped: number): string {
  const keyLabel =
    imported === 1
      ? SettingsImportStatusText.Key
      : SettingsImportStatusText.Keys;
  const base = `${SettingsImportStatusText.Imported} ${imported} ${keyLabel}`;
  return skipped > 0
    ? `${base}, ${SettingsImportStatusText.Skipped} ${skipped}`
    : base;
}

export async function exportSettingsBackup(): Promise<void> {
  const keys = (await cacheListKeys()).filter(isCacheKey);
  const exportData: Partial<Record<CacheKey, unknown>> = {};
  for (const key of keys) {
    const value = await cacheGet(key);
    if (value !== null && value !== undefined) exportData[key] = value;
  }

  const json = JSON.stringify(
    exportData,
    null,
    SettingsTransferPolicy.JsonIndent,
  );
  const blob = new Blob([json], { type: SettingsBackupFormat.MimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement(DomElementTag.Anchor);
  const date = new Date().toISOString().slice(
    SettingsTransferPolicy.DateStart,
    SettingsTransferPolicy.DateEnd,
  );
  anchor.href = url;
  anchor.download = `${SettingsBackupFormat.DownloadPrefix}${date}${SettingsBackupFormat.Extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importSettingsBackup(file: File): Promise<string> {
  if (file.size > SettingsTransferPolicy.MaximumImportBytes) {
    throw new SettingsImportError(
      ClientErrorMessage.SettingsImportFileTooLarge,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new SettingsImportError(
      ClientErrorMessage.SettingsImportParseFailed,
    );
  }

  if (!isRecord(parsed)) {
    throw new SettingsImportError(
      ClientErrorMessage.SettingsImportInvalidFormat,
    );
  }

  let imported = 0;
  let skipped = 0;
  for (const [key, value] of Object.entries(parsed)) {
    if (!isCacheKey(key) || value === null || value === undefined) {
      skipped += 1;
      continue;
    }
    await cacheSet(key, value);
    imported += 1;
  }
  return importStatus(imported, skipped);
}
