import { describe, expect, test } from "bun:test";
import {
  DomEvent,
  DomInputType,
  DomKey,
  DomVisibilityState,
  ServiceWorkerCache,
  ServiceWorkerPath,
  ServiceWorkerRequestMethod,
  ServiceWorkerRequestMode,
} from "@/runtime";

const RUNTIME_VOCABULARIES: readonly (readonly string[])[] = [
  Object.values(DomEvent),
  Object.values(DomInputType),
  Object.values(DomKey),
  Object.values(DomVisibilityState),
  Object.values(ServiceWorkerCache),
  Object.values(ServiceWorkerPath),
  Object.values(ServiceWorkerRequestMethod),
  Object.values(ServiceWorkerRequestMode),
];

describe("DOM runtime model", () => {
  test("owns unique browser runtime values", () => {
    for (const values of RUNTIME_VOCABULARIES) {
      expect(new Set(values).size).toBe(values.length);
    }
  });
});
