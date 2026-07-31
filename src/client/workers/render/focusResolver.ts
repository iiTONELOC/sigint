import type { CameraPosition } from "@/workers/render/camera";
import type {
  RenderFocusPayload,
  RenderSelectionIdentity,
} from "@/workers/render/protocol";
import { RenderLayerCatalog } from "@/workers/render/scene/renderLayerCatalog";

export class RenderFocusResolver {
  private readonly layers: RenderLayerCatalog;

  constructor(layers: RenderLayerCatalog) {
    this.layers = layers;
  }

  resolve(
    request: RenderFocusPayload,
    selection: RenderSelectionIdentity | null,
    selectedPosition: CameraPosition | null,
    time: number,
  ): CameraPosition | null {
    if (
      selectedPosition &&
      selection?.source === request.source &&
      selection.entityId === request.entityId
    ) {
      return selectedPosition;
    }
    const target = this.layers.selectionTarget(
      request.source,
      request.entityId,
      time,
    );
    return target
      ? {
          id: target.identity.interactionId,
          latitude: target.latitude,
          longitude: target.longitude,
        }
      : null;
  }
}
