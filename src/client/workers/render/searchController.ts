import type {
  RenderSearchSnapshot,
  RenderSelectionIdentity,
  SelectedIsolateMode,
} from "@/workers/render/protocol";
import type { RenderSourceId } from "@/workers/data/sourceIds";

enum SearchRevision {
  Initial = 0,
  Increment = 1,
}

enum SearchTextLength {
  Empty = 0,
}

export type RenderSearchSelectionState = Readonly<{
  identity: RenderSelectionIdentity;
  isolateMode: SelectedIsolateMode;
}>;

export type RenderSearchUpdate = Readonly<{
  search: RenderSearchSnapshot;
  restore: RenderSearchSelectionState | null;
}>;

export class RenderSearchController {
  private revision = SearchRevision.Initial;
  private text: string | null = null;
  private stashed: RenderSearchSelectionState | null = null;

  update(text: string | null): RenderSearchUpdate | null {
    const normalized = this.normalize(text);
    if (normalized === this.text) return null;
    this.text = normalized;
    this.revision += SearchRevision.Increment;
    const restore = normalized === null ? this.takeStashed() : null;
    return {
      search: {
        revision: this.revision,
        text: this.text,
      },
      restore,
    };
  }

  snapshot(): RenderSearchSnapshot | null {
    if (this.revision === SearchRevision.Initial) return null;
    return {
      revision: this.revision,
      text: this.text,
    };
  }

  hideSelection(
    source: RenderSourceId,
    searchRevision: number,
    matchesSearch: boolean,
    identity: RenderSelectionIdentity | null,
    isolateMode: SelectedIsolateMode,
  ): RenderSearchSelectionState | null {
    if (
      this.text === null ||
      searchRevision !== this.revision ||
      identity?.source !== source ||
      matchesSearch
    ) {
      return null;
    }
    this.stashed = { identity, isolateMode };
    return this.stashed;
  }

  private normalize(text: string | null): string | null {
    const normalized = text?.trim() ?? "";
    return normalized.length > SearchTextLength.Empty
      ? normalized
      : null;
  }

  private takeStashed(): RenderSearchSelectionState | null {
    const stashed = this.stashed;
    this.stashed = null;
    return stashed;
  }
}
