// ── Single-entry KMZ unzip helper ────────────────────────────────────
// Server-side only. No new runtime dependency — node:zlib is built into
// Bun. KMZ is a ZIP archive with one .kml entry; this reader parses the
// ZIP local file header in-place and inflates the deflate-raw payload.
//
// Why not a full ZIP parser: NHC cone KMZs are always single-entry
// archives. A 30-line reader is auditable; pulling in a 2 kLOC parser
// is overkill and adds supply-chain surface for nothing.
//
// SSRF / OWASP A10: callers must control the source bytes — the
// function does not fetch. Compression-method gating prevents inflating
// untrusted ZIP64 / encrypted archives that could be malformed in ways
// that crash the runtime.

import { inflateRaw } from "zlib";
import { promisify } from "util";

const inflateRawAsync = promisify(inflateRaw);

/** Decode a single-entry ZIP archive (e.g. NHC cone KMZ) to a string.
 *  Supports stored (compression method 0) and deflate (method 8) only.
 *  Throws on bad signature, unsupported compression, or short reads.
 *
 *  Layout of a ZIP local file header (PKZIP APPNOTE 6.3.10 §4.3.7):
 *    offset 0   4   signature 0x04034b50
 *    offset 4   2   version needed
 *    offset 6   2   general purpose bit flag
 *    offset 8   2   compression method
 *    offset 10  2   last mod file time
 *    offset 12  2   last mod file date
 *    offset 14  4   crc-32
 *    offset 18  4   compressed size
 *    offset 22  4   uncompressed size
 *    offset 26  2   file name length (n)
 *    offset 28  2   extra field length (m)
 *    offset 30  n   file name
 *    offset 30+n m  extra field
 *    offset 30+n+m  compressed data
 */
export async function unzipSingleEntryKmz(bytes: Uint8Array): Promise<string> {
  if (bytes.length < 30) {
    throw new Error("Not a ZIP file (truncated header)");
  }
  if (
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  ) {
    throw new Error("Not a ZIP file (bad local file header signature)");
  }
  const compressionMethod = bytes[8]! | (bytes[9]! << 8);
  const compressedSize =
    bytes[18]! |
    (bytes[19]! << 8) |
    (bytes[20]! << 16) |
    (bytes[21]! << 24);
  const fileNameLen = bytes[26]! | (bytes[27]! << 8);
  const extraLen = bytes[28]! | (bytes[29]! << 8);
  const dataStart = 30 + fileNameLen + extraLen;
  if (dataStart + compressedSize > bytes.length) {
    throw new Error("Not a ZIP file (entry data exceeds buffer)");
  }
  const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
  if (compressionMethod === 0) {
    return new TextDecoder().decode(compressed);
  }
  if (compressionMethod === 8) {
    const inflated = (await inflateRawAsync(compressed)) as Buffer;
    return new TextDecoder().decode(inflated);
  }
  throw new Error(`Unsupported ZIP compression method ${compressionMethod}`);
}
