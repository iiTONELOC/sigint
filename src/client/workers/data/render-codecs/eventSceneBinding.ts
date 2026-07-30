import type { EventPoint } from "@/features/intel/events/data/codec";
import {
  eventSeverity,
} from "@/features/intel/events/types";
import type {
  DatasetPatch,
} from "@/workers/data/datasetStore";
import { recordPosition } from "@/workers/data/source-model/position";
import {
  EventSceneAttribute,
  EventSceneSchema,
} from "@/workers/render/scene/eventSchema";
import type { SceneSourcePatch } from "@/workers/render/sceneProtocol";
import { Domain } from "@shared/domain/identity";
import { ScenePatchCodec } from "./sceneCodec";

enum EventSceneDefault {
  Timestamp = 0,
}

export type EventScenePublisher = (
  patch: SceneSourcePatch,
) => void;

function eventTimestamp(point: EventPoint): number {
  if (!point.timestamp) return EventSceneDefault.Timestamp;
  const timestamp = Date.parse(point.timestamp);
  return Number.isFinite(timestamp)
    ? timestamp
    : EventSceneDefault.Timestamp;
}

export class EventSceneBinding {
  private readonly codec = new ScenePatchCodec<EventPoint>({
    source: Domain.Events,
    attributeStride: EventSceneSchema.AttributeStride,
    stringAttributeStride: EventSceneSchema.StringAttributeStride,
    position: recordPosition,
    timestamp: eventTimestamp,
    writeAttributes: (point, target, offset) => {
      target[offset + EventSceneAttribute.Severity] =
        eventSeverity(point.data.severity);
    },
  });

  private readonly publishScene: EventScenePublisher;

  constructor(publishScene: EventScenePublisher) {
    this.publishScene = publishScene;
  }

  publish(patch: DatasetPatch<EventPoint>): void {
    this.publishScene(this.codec.encode(patch));
  }
}
