import {
  renderSelectionIdentitiesEqual,
  type RenderSelectionOverlay,
  type RenderSelectionSnapshot,
} from "@/workers/render/protocol";

export class SelectionOverlayStore {
  private overlay: RenderSelectionOverlay | null = null;

  apply(
    overlay: RenderSelectionOverlay,
    selected: RenderSelectionSnapshot,
  ): boolean {
    if (
      overlay.selection.revision !== selected.revision ||
      !renderSelectionIdentitiesEqual(
        overlay.selection.identity,
        selected.identity,
      )
    ) {
      return false;
    }
    this.overlay = overlay;
    return true;
  }

  clear(): void {
    this.overlay = null;
  }

  snapshot(): RenderSelectionOverlay | null {
    return this.overlay;
  }
}
