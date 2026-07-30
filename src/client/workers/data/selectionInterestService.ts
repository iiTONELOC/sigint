import {
  isTrackSource,
  trackMotion,
  type TrackSource,
  type TrailEntry,
} from "@/lib/geo/trails/trailStore";
import { Domain } from "@shared/domain/identity";
import type {
  AircraftRouteWaypoint,
} from "@shared/domain/aircraftDossier";
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

export type SelectionRouteReader = Readonly<{
  route: (
    entityId: string,
  ) => Promise<readonly AircraftRouteWaypoint[] | null>;
}>;

export class SelectionInterestService {
  private readonly publishOverlay: SelectionOverlayPublisher;
  private readonly routes: SelectionRouteReader;
  private readonly trails: SelectionTrailReader;
  private selected: RenderSelectionSnapshot | null = null;
  private selectedRoute: readonly AircraftRouteWaypoint[] | null = null;

  constructor(
    trails: SelectionTrailReader,
    routes: SelectionRouteReader,
    publishOverlay: SelectionOverlayPublisher,
  ) {
    this.trails = trails;
    this.routes = routes;
    this.publishOverlay = publishOverlay;
  }

  connect(): void {
    this.selected = null;
    this.selectedRoute = null;
  }

  update(selection: RenderSelectionSnapshot): boolean {
    if (
      this.selected &&
      selection.revision <= this.selected.revision
    ) {
      return false;
    }
    this.selected = selection;
    this.selectedRoute = null;
    this.publish();
    this.resolveRoute(selection);
    return true;
  }

  refresh(source: TrackSource): boolean {
    if (this.selected?.identity?.source !== source) return false;
    this.publish();
    if (source === Domain.Aircraft) {
      this.resolveRoute(this.selected);
    }
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
      route: this.selectedRoute,
    });
  }

  private resolveRoute(selection: RenderSelectionSnapshot): void {
    const identity = selection.identity;
    if (identity?.source !== Domain.Aircraft) return;
    void this.routes.route(identity.entityId).then(
      (route) => {
        if (this.selected !== selection || route === this.selectedRoute) {
          return;
        }
        this.selectedRoute = route;
        this.publish();
      },
      () => {
        if (this.selected !== selection) return;
        this.selectedRoute = null;
      },
    );
  }
}
