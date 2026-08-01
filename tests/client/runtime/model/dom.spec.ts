import { describe, expect, test } from "bun:test";
import {
  DomEvent,
  DomInputType,
  DomKey,
  DomVisibilityState,
  ServiceWorkerCache,
  ServiceWorkerElementId,
  ServiceWorkerLifecycleState,
  ServiceWorkerMessage,
  ServiceWorkerPath,
  ServiceWorkerRequestMethod,
  ServiceWorkerRequestMode,
  ServiceWorkerTiming,
} from "@/runtime";

function expectUniqueValues<T>(values: readonly T[]): void {
  expect(new Set(values).size).toBe(values.length);
}

describe("DOM runtime model", () => {
  test("owns unique browser runtime values", () => {
    expectUniqueValues(Object.values(DomEvent));
    expectUniqueValues(Object.values(DomInputType));
    expectUniqueValues(Object.values(DomKey));
    expectUniqueValues(Object.values(DomVisibilityState));
    expectUniqueValues(Object.values(ServiceWorkerCache));
    expectUniqueValues(Object.values(ServiceWorkerElementId));
    expectUniqueValues(Object.values(ServiceWorkerLifecycleState));
    expectUniqueValues(Object.values(ServiceWorkerMessage));
    expectUniqueValues(Object.values(ServiceWorkerPath));
    expectUniqueValues(Object.values(ServiceWorkerRequestMethod));
    expectUniqueValues(Object.values(ServiceWorkerRequestMode));
    expectUniqueValues(Object.values(ServiceWorkerTiming));
  });
});
