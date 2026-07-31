import type {
  TrackSource,
  TrailObservation,
} from "@/lib/geo/trails/trailStore";
import type { DatasetPatch } from "@/workers/data/datasetStore";
import type {
  SourcePatchObserver,
  SourceRecord,
} from "@/workers/data/source-model/dataSource";
import type { TrailRecorder } from "@/workers/data/trails/trailRecorder";

export type TrailObservationProjector<TEntity> = (
  entities: readonly TEntity[],
) => readonly TrailObservation[];

export class ObservedTrailBinding<TEntity extends SourceRecord>
  implements SourcePatchObserver<TEntity>
{
  private readonly projector: TrailObservationProjector<TEntity>;
  private readonly recorder: TrailRecorder;
  private readonly source: TrackSource;

  constructor(
    source: TrackSource,
    recorder: TrailRecorder,
    projector: TrailObservationProjector<TEntity>,
  ) {
    this.source = source;
    this.recorder = recorder;
    this.projector = projector;
  }

  observe(patch: DatasetPatch<TEntity>): void {
    this.recorder.observe(this.source, this.projector(patch.upserts));
  }
}
