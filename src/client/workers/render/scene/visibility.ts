import { IsolateMode, type SelectedIsolateMode } from "@/workers/render/protocol";
import type { RenderSceneView } from "@/workers/render/sceneStore";

export type SceneVisibilitySettings = Readonly<{
  searchIds: ReadonlySet<string> | null;
  isolateMode: SelectedIsolateMode;
  isolatedId: string | null;
  isolatedType: string | null;
}>;

export function sceneRecordIsVisible(
  view: RenderSceneView,
  index: number,
  pointType: string,
  enabled: boolean,
  settings: SceneVisibilitySettings,
): boolean {
  if (!enabled) return false;
  const id = view.ids[index];
  if (!id) return false;
  if (settings.searchIds && !settings.searchIds.has(id)) return false;
  if (
    settings.isolateMode === IsolateMode.Solo &&
    id !== settings.isolatedId
  ) {
    return false;
  }
  return !(
    settings.isolateMode === IsolateMode.Focus &&
    settings.isolatedType &&
    settings.isolatedType !== pointType
  );
}
