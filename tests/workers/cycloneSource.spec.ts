import { describe, expect, test } from "bun:test";
import { SourceCompleteness } from "@shared/source";
import type { CyclonePoint } from "@/features/environmental/cyclones/data/codec";
import {
  CycloneSource,
  cyclonePointsEqual,
  reconcileCyclonePoint,
} from "@/workers/data/sources/cyclones";
import type { DatasetPatch } from "@/workers/data/datasetStore";
import type { PointSourceFetchSnapshot } from "@/workers/data/sourceRuntime";
import {
  TEST_CYCLONE_FORECAST,
  TEST_CYCLONE_PAST_TRACK,
  testCyclonePoint,
} from "../_support/cyclone";
import {
  cycloneForecastSceneId,
} from "@shared/scene";
import { Domain } from "@shared/domain/identity";
import { sourceForPointType } from "@shared/domain/pointSource";
import {
  cycloneForecastPoint,
} from "@/features/environmental/cyclones/data/forecastProjection";
import {
  DATA_WORKER_PROTOCOL_VERSION,
  DataWorkerMessageType,
  parseDataWorkerEvent,
} from "@/workers/data/protocol";

enum TestTime {
  First = 1,
  Second = 2,
  Third = 3,
  Fourth = 4,
}

describe("cyclone source reconciliation", () => {
  test("owns forecast interactions under the cyclone source", () => {
    expect(sourceForPointType(Domain.CyclonesForecast)).toBe(
      Domain.Cyclones,
    );
    const point = cycloneForecastPoint(
      testCyclonePoint(),
      TEST_CYCLONE_FORECAST,
    );
    const event = parseDataWorkerEvent({
      type: DataWorkerMessageType.SourceEntity,
      protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
      requestId: 1,
      source: Domain.Cyclones,
      sourceVersion: 1,
      value: point,
    });
    expect(
      event?.type === DataWorkerMessageType.SourceEntity
        ? event.value
        : null,
    ).toEqual(point);
  });

  test("retains enrichment gaps and detects nested history changes", () => {
    const enriched = testCyclonePoint({
      forecast: [TEST_CYCLONE_FORECAST],
      pastTrack: [TEST_CYCLONE_PAST_TRACK],
      models: [{
        model: "OFCL",
        points: [{ tau: 24, lat: 26, lon: -74 }],
      }],
      windRadii: {
        lat: 25,
        lon: -75,
        vmaxKt: 75,
        validTime: "2026-09-18T00:00:00Z",
        kt34: [50, 40, 30, 40],
        kt50: null,
        kt64: null,
      },
    });
    const retained = reconcileCyclonePoint(enriched, testCyclonePoint());
    const extended = reconcileCyclonePoint(
      retained,
      testCyclonePoint({
        pastTrack: [
          TEST_CYCLONE_PAST_TRACK,
          {
            lat: 24.5,
            lon: -75.5,
            validTime: "2026-09-17T12:00:00Z",
            vmaxKt: 65,
          },
        ],
      }),
    );

    expect(retained.data.forecast).toBe(enriched.data.forecast);
    expect(retained.data.pastTrack).toBe(enriched.data.pastTrack);
    expect(retained.data.models).toBe(enriched.data.models);
    expect(retained.data.windRadii).toBe(enriched.data.windRadii);
    expect(cyclonePointsEqual(enriched, retained)).toBe(true);
    expect(cyclonePointsEqual(retained, extended)).toBe(false);
  });

  test("publishes retained updates and complete-source deletion", async () => {
    const initial = testCyclonePoint({
      forecast: [TEST_CYCLONE_FORECAST],
      pastTrack: [TEST_CYCLONE_PAST_TRACK],
    });
    const extended = testCyclonePoint({
      pastTrack: [
        TEST_CYCLONE_PAST_TRACK,
        {
          lat: 24.5,
          lon: -75.5,
          validTime: "2026-09-17T12:00:00Z",
          vmaxKt: 65,
        },
      ],
    });
    const snapshots: PointSourceFetchSnapshot<CyclonePoint>[] = [
      {
        completeness: SourceCompleteness.Complete,
        entities: [initial],
        observedAt: TestTime.First,
      },
      {
        completeness: SourceCompleteness.Complete,
        entities: [testCyclonePoint()],
        observedAt: TestTime.Second,
      },
      {
        completeness: SourceCompleteness.Complete,
        entities: [extended],
        observedAt: TestTime.Third,
      },
      {
        completeness: SourceCompleteness.Complete,
        entities: [],
        observedAt: TestTime.Fourth,
      },
    ];
    const patches: DatasetPatch<CyclonePoint>[] = [];
    const source = new CycloneSource({
      fetchSnapshot: async () => {
        const snapshot = snapshots.shift();
        expect(snapshot).toBeDefined();
        return snapshot ?? {
          completeness: SourceCompleteness.Complete,
          entities: [],
          observedAt: TestTime.Fourth,
        };
      },
    });
    source.attach({
      readCache: async () => null,
      persistCache: () => undefined,
      publishStatus: () => undefined,
      publishPatch: (patch) => {
        patches.push(patch);
      },
    });

    await source.refresh();
    const forecast = source.resolveEntity(
      cycloneForecastSceneId(
        initial.data.stormId,
        TEST_CYCLONE_FORECAST.fcstHour,
      ),
    );
    expect(forecast?.type).toBe(Domain.CyclonesForecast);
    expect(
      forecast?.type === Domain.CyclonesForecast
        ? forecast.data.parentEntityId
        : null,
    ).toBe(initial.id);
    await source.refresh();
    await source.refresh();
    await source.refresh();

    expect(patches[0]?.upserts).toEqual([initial]);
    expect(patches[1]?.upserts).toEqual([]);
    expect(patches[2]?.upserts[0]?.data.forecast).toBe(
      initial.data.forecast,
    );
    expect(patches[2]?.upserts[0]?.data.pastTrack).toEqual(
      extended.data.pastTrack,
    );
    expect(patches[3]?.deletedIds).toEqual([initial.id]);
  });
});
