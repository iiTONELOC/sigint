import { describe, test, expect } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { unzipSingleEntryKmz } from "../../../src/server/api/zipReader";

// ── ZIP local file header builder (test-side) ──────────────────────
// Mirrors the structure used in scripts/build-cone-kmz-fixture.ts. Kept
// inline here so the spec is self-contained — if the field layout
// changes in the reader, this test must be updated in lockstep.

function u16(buf: Uint8Array, off: number, v: number): void {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >>> 8) & 0xff;
}
function u32(buf: Uint8Array, off: number, v: number): void {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >>> 8) & 0xff;
  buf[off + 2] = (v >>> 16) & 0xff;
  buf[off + 3] = (v >>> 24) & 0xff;
}

function buildZip(
  payload: Uint8Array,
  compressed: Uint8Array,
  compressionMethod: number,
  filename: string = "doc.kml",
): Uint8Array {
  const fnBytes = new TextEncoder().encode(filename);
  const header = new Uint8Array(30);
  u32(header, 0, 0x04034b50);
  u16(header, 4, 20);
  u16(header, 6, 0);
  u16(header, 8, compressionMethod);
  u16(header, 10, 0);
  u16(header, 12, 0);
  u32(header, 14, 0); // CRC ignored by reader
  u32(header, 18, compressed.length);
  u32(header, 22, payload.length);
  u16(header, 26, fnBytes.length);
  u16(header, 28, 0);
  const out = new Uint8Array(30 + fnBytes.length + compressed.length);
  out.set(header, 0);
  out.set(fnBytes, 30);
  out.set(compressed, 30 + fnBytes.length);
  return out;
}

describe("unzipSingleEntryKmz", () => {
  test("decodes a stored (method 0) entry", () => {
    const payload = new TextEncoder().encode(
      "<?xml?><kml><Document/></kml>",
    );
    const zip = buildZip(payload, payload, 0);
    expect(unzipSingleEntryKmz(zip)).toBe("<?xml?><kml><Document/></kml>");
  });

  test("decodes a deflate (method 8) entry", () => {
    const payload = new TextEncoder().encode(
      "<?xml?><kml><Document><Placemark/></Document></kml>",
    );
    const compressed = new Uint8Array(deflateRawSync(payload));
    const zip = buildZip(payload, compressed, 8);
    expect(unzipSingleEntryKmz(zip)).toBe(
      "<?xml?><kml><Document><Placemark/></Document></kml>",
    );
  });

  test("decodes the vendored Milton cone KMZ fixture", async () => {
    const bytes = new Uint8Array(
      await Bun.file("tests/fixtures/cyclones-cone/milton-al14-cone.kmz")
        .arrayBuffer(),
    );
    const kml = unzipSingleEntryKmz(bytes);
    expect(kml).toContain("<Polygon>");
    expect(kml).toContain("<coordinates>");
    expect(kml).toContain("-90.0,22.4,0");
  });

  test("rejects buffer with bad signature", () => {
    const bad = new Uint8Array([0x00, 0x00, 0x00, 0x00, ...new Array(40).fill(0)]);
    expect(() => unzipSingleEntryKmz(bad)).toThrow(
      "Not a ZIP file (bad local file header signature)",
    );
  });

  test("rejects truncated header", () => {
    const tiny = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    expect(() => unzipSingleEntryKmz(tiny)).toThrow(
      "Not a ZIP file (truncated header)",
    );
  });

  test("rejects unsupported compression method (e.g. 99 = encrypted)", () => {
    const payload = new TextEncoder().encode("doesn't matter");
    const zip = buildZip(payload, payload, 99);
    expect(() => unzipSingleEntryKmz(zip)).toThrow(
      "Unsupported ZIP compression method 99",
    );
  });

  test("rejects entry whose compressed-size field exceeds buffer length", () => {
    const payload = new TextEncoder().encode("hello");
    const compressed = new Uint8Array(deflateRawSync(payload));
    const zip = buildZip(payload, compressed, 8);
    // Tamper: bump the compressedSize field to point past the end of the buffer.
    u32(zip, 18, zip.length + 100);
    expect(() => unzipSingleEntryKmz(zip)).toThrow(
      "Not a ZIP file (entry data exceeds buffer)",
    );
  });
});
