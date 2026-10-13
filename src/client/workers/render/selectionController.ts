import { SequenceStep } from "@shared/scene";
import type {
  RenderSelectionIdentity,
  RenderSelectionSnapshot,
} from "@/workers/render/protocol";
import {
  renderSelectionIdentitiesEqual,
} from "@/workers/render/protocol";


export class RenderSelectionController {
  private identity: RenderSelectionIdentity | null = null;
  private revision = SequenceStep.Initial;

  set(next: RenderSelectionIdentity | null): boolean {
    if (renderSelectionIdentitiesEqual(this.identity, next)) return false;
    this.identity = next ? { ...next } : null;
    this.revision += SequenceStep.Increment;
    return true;
  }

  snapshot(): RenderSelectionSnapshot {
    return {
      revision: this.revision,
      identity: this.identity,
    };
  }
}
