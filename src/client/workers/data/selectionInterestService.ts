import {
  isTrackSource,
  trackMotion,
  type TrackSource,
  type TrailEntry,
} from "@/lib/geo/trails/trailStore";
import type {
  RenderSelectionSnapshot,
} from "@/workers/render/protocol";
import {
  SceneDataCommandType,
  type SceneSelectionOverlay,
} from "@/workers/render/sceneProtocol";

export type SelectionTrailReader = Readonly<{
  get: (id: string) => TrailEntry | null;
}>;

export type SelectionOverlayPublisher = (
  overlay: SceneSelectionOverlay,
) => void;

export class SelectionInterestService {
  private readonly publishOverlay: SelectionOverlayPublisher;
  private readonly trails: SelectionTrailReader;
  private selected: RenderSelectionSnapshot | null = null;

  constructor(
    trails: SelectionTrailReader,
    publishOverlay: SelectionOverlayPublisher,
  ) {
    this.trails = trails;
    this.publishOverlay = publishOverlay;
  }

  connect(): void {
    this.selected = null;
  }

  update(selection: RenderSelectionSnapshot): boolean {
    if (
      this.selected &&
      selection.revision <= this.selected.revision
    ) {
      return false;
    }
    this.selected = selection;
    this.publish();
    return true;
  }

  refresh(source: TrackSource): boolean {
    if (this.selected?.identity?.source !== source) return false;
    this.publish();
    return true;
  }

  private publish(): void {
    const selection = this.selected;
    if (!selection) return;
    const identity = selection.identity;
    const entry =
      identity && isTrackSource(identity.source)
        ? this.trails.get(identity.entityId)
        : null;
    const selectedEntry =
      entry?.type === identity?.source
        ? entry
        : null;
    this.publishOverlay({
      type: SceneDataCommandType.SelectionOverlay,
      selection,
      trail: selectedEntry?.points ?? [],
      motion: selectedEntry ? trackMotion(selectedEntry) : null,
    });
  }
}
