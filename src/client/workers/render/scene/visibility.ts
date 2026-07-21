import type { RenderSceneView } from "@/workers/render/sceneStore";

export type SceneVisibilitySettings = Readonly<{
  searchIds: ReadonlySet<string> | null;
  isolateMode: "solo" | "focus" | null;
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
    settings.isolateMode === "solo" &&
    id !== settings.isolatedId
  ) {
    return false;
  }
  return !(
    settings.isolateMode === "focus" &&
    settings.isolatedType &&
    settings.isolatedType !== pointType
  );
}
