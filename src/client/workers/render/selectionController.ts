import type {
  RenderSelectionIdentity,
  RenderSelectionSnapshot,
} from "@/workers/render/protocol";
import {
  renderSelectionIdentitiesEqual,
} from "@/workers/render/protocol";

enum SelectionRevision {
  Initial = 0,
  Increment = 1,
}

export class RenderSelectionController {
  private identity: RenderSelectionIdentity | null = null;
  private revision = SelectionRevision.Initial;

  set(next: RenderSelectionIdentity | null): boolean {
    if (renderSelectionIdentitiesEqual(this.identity, next)) return false;
    this.identity = next ? { ...next } : null;
    this.revision += SelectionRevision.Increment;
    return true;
  }

  snapshot(): RenderSelectionSnapshot {
    return {
      revision: this.revision,
      identity: this.identity,
    };
  }
}
