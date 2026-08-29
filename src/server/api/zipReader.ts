import { inflateRaw } from "zlib";
import { promisify } from "util";
import { fetchWithTimeout, FETCH_TIMEOUT_STANDARD_MS } from "../lib/fetchWithTimeout";

const inflateRawAsync = promisify(inflateRaw);

enum ZipHeader {
  ByteLength = 30,
  SignatureOffset = 0,
  Signature = 0x04034b50,
  CompressionMethodOffset = 8,
  CompressedSizeOffset = 18,
  FileNameLengthOffset = 26,
  ExtraLengthOffset = 28,
}

enum ZipCompressionMethod {
  Stored = 0,
  Deflate = 8,
}

enum ZipReadErrorMessage {
  TruncatedHeader = "Not a ZIP file (truncated header)",
  InvalidSignature = "Not a ZIP file (bad local file header signature)",
  EntryOutsideBuffer = "Not a ZIP file (entry data exceeds buffer)",
  UnsupportedCompression = "Unsupported ZIP compression method",
}

class ZipReadError extends Error {
  constructor(
    message: ZipReadErrorMessage,
    readonly compressionMethod: number | null = null,
  ) {
    super(message);
  }
}

/** Decode the first entry in a ZIP archive to text. */
export async function unzipSingleEntryKmz(bytes: Uint8Array): Promise<string> {
  if (bytes.length < ZipHeader.ByteLength) {
    throw new ZipReadError(ZipReadErrorMessage.TruncatedHeader);
  }

  const header = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  if (
    header.getUint32(ZipHeader.SignatureOffset, true) !== ZipHeader.Signature
  ) {
    throw new ZipReadError(ZipReadErrorMessage.InvalidSignature);
  }

  const compressionMethod = header.getUint16(
    ZipHeader.CompressionMethodOffset,
    true,
  );
  const compressedSize = header.getUint32(
    ZipHeader.CompressedSizeOffset,
    true,
  );
  const fileNameLength = header.getUint16(
    ZipHeader.FileNameLengthOffset,
    true,
  );
  const extraLength = header.getUint16(
    ZipHeader.ExtraLengthOffset,
    true,
  );
  const dataStart = ZipHeader.ByteLength + fileNameLength + extraLength;
  if (dataStart + compressedSize > bytes.length) {
    throw new ZipReadError(ZipReadErrorMessage.EntryOutsideBuffer);
  }

  const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
  if (compressionMethod === ZipCompressionMethod.Stored) {
    return new TextDecoder().decode(compressed);
  }
  if (compressionMethod === ZipCompressionMethod.Deflate) {
    const inflated = (await inflateRawAsync(compressed)) as Uint8Array;
    return new TextDecoder().decode(inflated);
  }
  throw new ZipReadError(
    ZipReadErrorMessage.UnsupportedCompression,
    compressionMethod,
  );
}

/** Fetch a KMZ and decode its first entry; null on a non-2xx response. */
export async function fetchKmz(url: string): Promise<string | null> {
  const response = await fetchWithTimeout(url, FETCH_TIMEOUT_STANDARD_MS);
  if (!response.ok) return null;
  return unzipSingleEntryKmz(new Uint8Array(await response.arrayBuffer()));
}
