import type {
  RenderSelectionIdentity,
  RenderSelectionSnapshot,
} from "@/workers/render/protocol";

enum SelectionRevision {
  Initial = 0,
  Increment = 1,
}

function identitiesEqual(
  left: RenderSelectionIdentity | null,
  right: RenderSelectionIdentity | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.source === right.source &&
    left.entityId === right.entityId &&
    left.interactionId === right.interactionId &&
    left.pointType === right.pointType
  );
}

export class RenderSelectionController {
  private identity: RenderSelectionIdentity | null = null;
  private revision = SelectionRevision.Initial;

  set(next: RenderSelectionIdentity | null): boolean {
    if (identitiesEqual(this.identity, next)) return false;
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
