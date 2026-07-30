import { IsolateMode, type SelectedIsolateMode } from "@/workers/render/protocol";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import type { DataType } from "@/features/base/dataPoints";

export type SceneVisibilitySettings = Readonly<{
  isolateMode: SelectedIsolateMode;
  isolatedId: string | null;
  isolatedType: string | null;
}>;

export type EnabledSceneFilter = SceneVisibilitySettings &
  Readonly<{ enabled: boolean }>;

export function sceneRecordIsVisible(
  view: RenderSceneView,
  index: number,
  pointType: DataType,
  enabled: boolean,
  settings: SceneVisibilitySettings,
): boolean {
  if (!enabled) return false;
  const entityId = view.entityIds[index];
  if (!entityId) return false;
  if (
    settings.isolateMode === IsolateMode.Solo &&
    entityId !== settings.isolatedId
  ) {
    return false;
  }
  return !(
    settings.isolateMode === IsolateMode.Focus &&
    settings.isolatedType &&
    settings.isolatedType !== pointType
  );
}
