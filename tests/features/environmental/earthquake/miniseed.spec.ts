import { describe, expect, test } from "bun:test";
import { decodeMiniSeed } from "@/features/environmental/earthquake/data/miniseed";

const FIXTURE = new URL("./fixtures/anmo-bhz-2026-08-26.mseed", import.meta.url);

async function fixtureBytes(): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(FIXTURE).arrayBuffer());
}

function headerSampleCount(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let total = 0;
  for (let start = 0; start < bytes.byteLength; start += 512) {
    total += view.getUint16(start + 30, false);
  }
  return total;
}

describe("miniSEED decoder", () => {
  test("decodes a live Steim2 dataselect response with the reverse constant intact", async () => {
    const bytes = await fixtureBytes();
    const decoded = decodeMiniSeed(bytes);
    expect(decoded).not.toBeNull();
    if (!decoded) return;
    expect(decoded.sampleRate).toBe(40);
    expect(decoded.samples).toHaveLength(headerSampleCount(bytes));
    expect(decoded.samples.every((sample) => Number.isInteger(sample))).toBe(true);
    expect(new Set(decoded.samples).size).toBeGreaterThan(1);
  });

  test("rejects a corrupted record instead of returning noise", async () => {
    const bytes = await fixtureBytes();
    const firstDifferenceWord = 512 + 64 + 12;
    bytes[firstDifferenceWord + 3] = (bytes[firstDifferenceWord + 3]! + 1) & 0xff;
    expect(decodeMiniSeed(bytes)).toBeNull();
  });

  test("rejects an empty or truncated body", async () => {
    const bytes = await fixtureBytes();
    expect(decodeMiniSeed(new Uint8Array(0))).toBeNull();
    expect(decodeMiniSeed(bytes.subarray(0, 700))).toBeNull();
  });
});
