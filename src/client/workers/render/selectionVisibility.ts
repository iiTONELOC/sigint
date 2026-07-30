import {
  IsolateMode,
  type RenderPresentationPayload,
  type RenderSelectionIdentity,
} from "@/workers/render/protocol";
import type {
  RenderSourceId,
} from "@/workers/data/sourceIds";
import { Domain } from "@shared/domain/identity";

export type SelectionVisibility = Readonly<{
  selection: RenderSelectionIdentity | null;
  isolateMode: RenderPresentationPayload["isolateMode"];
  isolatedId: string | null;
  isolatedType: string | null;
  aircraftEntityIsVisible: (entityId: string) => boolean;
  sourceIsVisible: (source: RenderSourceId) => boolean;
  searchIncludesEntity: (
    selection: RenderSelectionIdentity,
  ) => boolean;
}>;

export function selectionIsVisible(
  settings: SelectionVisibility,
): boolean {
  const selection = settings.selection;
  if (!selection) return false;
  if (!settings.searchIncludesEntity(selection)) return false;
  if (
    settings.isolateMode === IsolateMode.Solo &&
    selection.interactionId !== settings.isolatedId
  ) {
    return false;
  }
  if (
    settings.isolateMode === IsolateMode.Focus &&
    settings.isolatedType &&
    selection.pointType !== settings.isolatedType
  ) {
    return false;
  }
  if (selection.pointType === Domain.Aircraft) {
    return settings.aircraftEntityIsVisible(selection.entityId);
  }
  return settings.sourceIsVisible(selection.source);
}
