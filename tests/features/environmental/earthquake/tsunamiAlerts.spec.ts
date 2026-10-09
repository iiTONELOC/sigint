import { afterEach, describe, expect, test } from "bun:test";
import { HttpStatus } from "@shared/http";
import { TsunamiLevel } from "@shared/domain/earthquakes";
import { fetchTsunamiAlerts } from "@/features/environmental/earthquake/data/tsunamiAlerts";
import { SourceFetchError, SourceFetchFailure } from "@/workers/data/source-model/remoteSource";

const realFetch = globalThis.fetch;

function respond(response: Response): void {
  globalThis.fetch = (async () => response) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchTsunamiAlerts", () => {
  test("a failed request is an error, not an empty list of alerts", async () => {
    respond(new Response("down", { status: HttpStatus.ServiceUnavailable }));
    const failure = await fetchTsunamiAlerts().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SourceFetchError);
    expect((failure as SourceFetchError).failure).toBe(SourceFetchFailure.Request);
  });

  test("a malformed response is an error, not an empty list of alerts", async () => {
    respond(Response.json({ unexpected: true }));
    const failure = await fetchTsunamiAlerts().catch((error: unknown) => error);
    expect((failure as SourceFetchError).failure).toBe(SourceFetchFailure.Payload);
  });

  test("keeps only tsunami alerts from a valid response", async () => {
    respond(Response.json({
      features: [
        { id: "a", properties: { event: "Tsunami Warning", areaDesc: "Coast", headline: "h", expires: "e" } },
        { id: "b", properties: { event: "Flood Watch" } },
      ],
    }));
    const alerts = await fetchTsunamiAlerts();
    expect(alerts.map((alert) => alert.level)).toEqual([TsunamiLevel.Warning]);
  });
});
