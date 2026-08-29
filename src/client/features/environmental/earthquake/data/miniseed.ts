// miniSEED v2 reader for the seismogram: fixed header, blockette 1000, and
// Steim1, Steim2, and plain integer sample encodings. Every record's reverse
// integration constant is checked, so a decode error yields null, not noise.

export type DecodedTimeseries = Readonly<{
  sampleRate: number;
  samples: number[];
}>;

enum RecordHeader {
  FixedLength = 48,
  YearOffset = 20,
  SampleCountOffset = 30,
  RateFactorOffset = 32,
  RateMultiplierOffset = 34,
  DataOffset = 44,
  FirstBlocketteOffset = 46,
}

enum BlocketteField {
  Type = 0,
  Next = 2,
  Encoding = 4,
  WordOrder = 5,
  RecordLengthPower = 6,
}

enum SeedLimit {
  DataOnlyBlockette = 1000,
  MinimumYear = 1900,
  MaximumYear = 2100,
  BigEndianWordOrder = 1,
}

enum SampleEncoding {
  Int16 = 1,
  Int32 = 3,
  Steim1 = 10,
  Steim2 = 11,
}

enum Steim {
  FrameBytes = 64,
  WordsPerFrame = 16,
  WordBytes = 4,
  WordBits = 32,
  NibbleMask = 3,
  TopNibbleShift = 30,
}

/** Word slots in the first frame that hold the integration constants. */
enum SteimConstantWord {
  Forward = 1,
  Reverse = 2,
}

const NIBBLE_BITS = 2;

enum SteimCode {
  Skip = 0,
  FourBytes = 1,
  Steim1TwoHalves = 2,
  Steim1OneWord = 3,
}

/** Steim2 packings by (nibble code, top two payload bits): [count, bits]. */
const STEIM2_PACKING: Readonly<Record<number, readonly [number, number]>> = {
  0x21: [1, 30],
  0x22: [2, 15],
  0x23: [3, 10],
  0x30: [5, 6],
  0x31: [6, 5],
  0x32: [7, 4],
};

type RecordLayout = Readonly<{
  bigEndian: boolean;
  dataStart: number;
  encoding: number;
  recordLength: number;
  sampleCount: number;
  sampleRate: number;
  wordsBigEndian: boolean;
}>;

function signedField(word: number, shift: number, bits: number): number {
  return ((word >>> shift) << (Steim.WordBits - bits)) >> (Steim.WordBits - bits);
}

function pushFields(target: number[], word: number, count: number, bits: number): void {
  for (let index = 0; index < count; index++) {
    target.push(signedField(word, bits * (count - 1 - index), bits));
  }
}

function pushDifferences(
  target: number[],
  word: number,
  code: number,
  encoding: SampleEncoding,
): void {
  if (code === SteimCode.FourBytes) return pushFields(target, word, 4, 8);
  if (encoding === SampleEncoding.Steim1) {
    if (code === SteimCode.Steim1TwoHalves) pushFields(target, word, 2, 16);
    else pushFields(target, word, 1, 32);
    return;
  }
  const packing = STEIM2_PACKING[(code << 4) | (word >>> Steim.TopNibbleShift)];
  if (packing) pushFields(target, word, packing[0], packing[1]);
}

type SteimFrame = Readonly<{
  encoding: SampleEncoding;
  little: boolean;
  start: number;
  skipConstants: boolean;
}>;

/** Append one frame's differences; the first frame skips its two constants. */
function readFrame(view: DataView, frame: SteimFrame, target: number[]): void {
  const nibbles = view.getUint32(frame.start, frame.little);
  for (let word = 1; word < Steim.WordsPerFrame; word++) {
    if (frame.skipConstants && word <= SteimConstantWord.Reverse) continue;
    const code = (nibbles >>> (Steim.TopNibbleShift - word * NIBBLE_BITS)) & Steim.NibbleMask;
    if (code === SteimCode.Skip) continue;
    const offset = frame.start + word * Steim.WordBytes;
    pushDifferences(target, view.getUint32(offset, frame.little), code, frame.encoding);
  }
}

function decodeSteim(view: DataView, layout: RecordLayout): number[] | null {
  const little = !layout.wordsBigEndian;
  const differences: number[] = [];
  const forward = view.getInt32(
    layout.dataStart + SteimConstantWord.Forward * Steim.WordBytes, little,
  );
  const reverse = view.getInt32(
    layout.dataStart + SteimConstantWord.Reverse * Steim.WordBytes, little,
  );
  const end = layout.recordLength - Steim.FrameBytes;
  for (let start = layout.dataStart; start <= end; start += Steim.FrameBytes) {
    readFrame(view, {
      encoding: layout.encoding,
      little,
      skipConstants: start === layout.dataStart,
      start,
    }, differences);
  }
  if (differences.length < layout.sampleCount) return null;
  const samples = [forward];
  for (let index = 1; index < layout.sampleCount; index++) {
    samples.push(samples[index - 1]! + differences[index]!);
  }
  return samples.at(-1) === reverse ? samples : null;
}

function decodeIntegers(view: DataView, layout: RecordLayout, bytes: number): number[] {
  const little = !layout.wordsBigEndian;
  const samples: number[] = [];
  for (let index = 0; index < layout.sampleCount; index++) {
    const offset = layout.dataStart + index * bytes;
    samples.push(bytes === 2 ? view.getInt16(offset, little) : view.getInt32(offset, little));
  }
  return samples;
}

function sampleRateOf(factor: number, multiplier: number): number {
  if (factor === 0 || multiplier === 0) return Number.NaN;
  const base = factor > 0 ? factor : -1 / factor;
  return multiplier > 0 ? base * multiplier : base / -multiplier;
}

function dataOnlyBlockette(view: DataView, start: number, little: boolean): number | null {
  let offset = view.getUint16(start + RecordHeader.FirstBlocketteOffset, little);
  while (offset !== 0 && offset + BlocketteField.RecordLengthPower < view.byteLength - start) {
    const at = start + offset;
    if (view.getUint16(at + BlocketteField.Type, little) === SeedLimit.DataOnlyBlockette) return at;
    offset = view.getUint16(at + BlocketteField.Next, little);
  }
  return null;
}

function recordLayout(view: DataView, start: number): RecordLayout | null {
  if (start + RecordHeader.FixedLength > view.byteLength) return null;
  const bigYear = view.getUint16(start + RecordHeader.YearOffset, false);
  const bigEndian = bigYear >= SeedLimit.MinimumYear && bigYear <= SeedLimit.MaximumYear;
  const little = !bigEndian;
  const blockette = dataOnlyBlockette(view, start, little);
  if (blockette === null) return null;
  return {
    bigEndian,
    dataStart: start + view.getUint16(start + RecordHeader.DataOffset, little),
    encoding: view.getUint8(blockette + BlocketteField.Encoding),
    recordLength: start + 2 ** view.getUint8(blockette + BlocketteField.RecordLengthPower),
    sampleCount: view.getUint16(start + RecordHeader.SampleCountOffset, little),
    sampleRate: sampleRateOf(
      view.getInt16(start + RecordHeader.RateFactorOffset, little),
      view.getInt16(start + RecordHeader.RateMultiplierOffset, little),
    ),
    wordsBigEndian:
      view.getUint8(blockette + BlocketteField.WordOrder) === SeedLimit.BigEndianWordOrder,
  };
}

function decodeRecord(view: DataView, layout: RecordLayout): number[] | null {
  switch (layout.encoding) {
    case SampleEncoding.Steim1:
    case SampleEncoding.Steim2:
      return decodeSteim(view, layout);
    case SampleEncoding.Int16:
      return decodeIntegers(view, layout, 2);
    case SampleEncoding.Int32:
      return decodeIntegers(view, layout, 4);
    default:
      return null;
  }
}

/** Decode every record in a miniSEED response; null when any record fails. */
export function decodeMiniSeed(bytes: Uint8Array): DecodedTimeseries | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples: number[] = [];
  let sampleRate = Number.NaN;
  let start = 0;
  while (start < view.byteLength) {
    const layout = recordLayout(view, start);
    if (!layout || layout.recordLength > view.byteLength) return null;
    const decoded = decodeRecord(view, layout);
    if (!decoded) return null;
    samples.push(...decoded);
    if (!Number.isFinite(sampleRate)) sampleRate = layout.sampleRate;
    start = layout.recordLength;
  }
  if (samples.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  return { sampleRate, samples };
}
