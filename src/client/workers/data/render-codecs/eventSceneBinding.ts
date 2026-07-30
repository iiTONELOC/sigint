import type { EventPoint } from "@/features/intel/events/data/codec";
import {
  eventSeverity,
} from "@/features/intel/events/types";
import { recordPosition } from "@/workers/data/source-model/position";
import {
  EventSceneAttribute,
  EventSceneSchema,
} from "@/workers/render/scene/eventSchema";
import { Domain } from "@shared/domain/identity";
import {
  SceneBinding,
  type SceneCommandPublisher,
} from "./sceneBinding";
import { ScenePatchCodec } from "./sceneCodec";

enum EventSceneDefault {
  Timestamp = 0,
}

function eventTimestamp(point: EventPoint): number {
  if (!point.timestamp) return EventSceneDefault.Timestamp;
  const timestamp = Date.parse(point.timestamp);
  return Number.isFinite(timestamp)
    ? timestamp
    : EventSceneDefault.Timestamp;
}

export class EventSceneBinding extends SceneBinding<EventPoint> {
  constructor(publishScene: SceneCommandPublisher) {
    super(
      new ScenePatchCodec<EventPoint>({
        source: Domain.Events,
        attributeStride: EventSceneSchema.AttributeStride,
        stringAttributeStride: EventSceneSchema.StringAttributeStride,
        position: recordPosition,
        timestamp: eventTimestamp,
        writeAttributes: (point, target, offset) => {
          target[offset + EventSceneAttribute.Severity] =
            eventSeverity(point.data.severity);
        },
      }),
      publishScene,
    );
  }
}
