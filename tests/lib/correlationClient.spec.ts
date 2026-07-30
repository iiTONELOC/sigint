import { describe, test, expect } from "bun:test";
import { createCorrelationClient } from "../../src/client/lib/net/correlationClient";
import { emptyBaseline } from "../../src/client/lib/correlation";

describe("createCorrelationClient — inline fallback", () => {
  test("returns a CorrelationResult shape", async () => {
    const client = createCorrelationClient();
    const result = await client.request([], [], emptyBaseline());
    expect(Array.isArray(result.products)).toBe(true);
    expect(Array.isArray(result.alerts)).toBe(true);
    expect(result.baseline).toBeDefined();
    expect(typeof result.baseline.lastUpdated).toBe("number");
    client.terminate();
  });

  test("preserves baseline mutation across calls (caller-owned state)", async () => {
    const client = createCorrelationClient();
    const start = emptyBaseline();
    const first = await client.request([], [], start);
    const second = await client.request([], [], first.baseline);
    expect(second.baseline.lastUpdated).toBeGreaterThanOrEqual(
      first.baseline.lastUpdated,
    );
    client.terminate();
  });
});
