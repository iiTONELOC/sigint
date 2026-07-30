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
import {
  ScenePatchCodec,
  sceneTimestamp,
  singleSceneRecord,
} from "./sceneCodec";

export class EventSceneBinding extends SceneBinding<EventPoint> {
  constructor(publishScene: SceneCommandPublisher) {
    super(
      new ScenePatchCodec<EventPoint>({
        source: Domain.Events,
        attributeStride: EventSceneSchema.AttributeStride,
        stringAttributeStride: EventSceneSchema.StringAttributeStride,
        records: singleSceneRecord,
        position: recordPosition,
        timestamp: sceneTimestamp,
        writeAttributes: (point, target, offset) => {
          target[offset + EventSceneAttribute.Severity] =
            eventSeverity(point.data.severity);
        },
      }),
      publishScene,
    );
  }
}
