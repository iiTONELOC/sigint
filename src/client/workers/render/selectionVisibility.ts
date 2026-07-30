import {
  IsolateMode,
  type RenderPresentationPayload,
  type RenderSelectionIdentity,
} from "@/workers/render/protocol";
import { Domain } from "@shared/domain/identity";

export type SelectionVisibility = Readonly<{
  selection: RenderSelectionIdentity | null;
  searchIds: ReadonlySet<string> | null;
  isolateMode: RenderPresentationPayload["isolateMode"];
  isolatedId: string | null;
  isolatedType: string | null;
  layers: RenderPresentationPayload["layers"];
  aircraftEntityIsVisible: (entityId: string) => boolean;
}>;

export function selectionIsVisible(
  settings: SelectionVisibility,
): boolean {
  const selection = settings.selection;
  if (!selection) return false;
  if (
    settings.searchIds &&
    !settings.searchIds.has(selection.interactionId)
  ) {
    return false;
  }
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
  return settings.layers[selection.pointType] !== false;
}
