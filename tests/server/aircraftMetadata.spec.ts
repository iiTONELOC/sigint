import { describe, test, expect } from "bun:test";

const MIL_TYPECODES = new Set([
  "F16",
  "F15",
  "F18S",
  "F18H",
  "F22",
  "F35",
  "FA18",
  "F14",
  "F5",
  "F4",
  "EUFI",
  "RFAL",
  "TOR",
  "GRIF",
  "HAWK",
  "TEX2",
  "T38",
  "TUCA",
  "B52",
  "B1",
  "B2",
  "A10",
  "C17",
  "C5",
  "C5M",
  "C30J",
  "C130",
  "C160",
  "A400",
  "C27J",
  "K35R",
  "K35E",
  "KC10",
  "K46A",
  "U2",
  "R135",
  "E3TF",
  "E3CF",
  "E6",
  "P3",
  "P8",
  "E314",
  "H64",
  "H47",
  "H53",
  "H60",
  "V22",
  "LYNX",
  "NH90",
  "TIGR",
  "EH10",
  "PUMA",
  "GAZL",
  "PRED",
  "REAP",
  "GLHK",
]);
const MIL_OPERATOR_KEYWORDS = [
  "air force",
  "navy",
  "army",
  "military",
  "luftwaffe",
  "marine nationale",
  "fuerza aerea",
  "aeronautica militar",
  "armada",
  "armée de l",
  "ejercito",
  "força aérea",
  "force aerienne",
  "forsvaret",
  "flygvapnet",
];
const US_MIL_HEX_LO = 0xae0000;
const US_MIL_HEX_HI = 0xafffff;

function classifyMilitary(
  icao24: string,
  typecode?: string,
  operator?: string,
): boolean {
  if (typecode && MIL_TYPECODES.has(typecode.toUpperCase())) return true;
  if (operator) {
    const opLower = operator.toLowerCase();
    for (const kw of MIL_OPERATOR_KEYWORDS) {
      if (opLower.includes(kw)) return true;
    }
  }
  const hex = parseInt(icao24, 16);
  if (hex >= US_MIL_HEX_LO && hex <= US_MIL_HEX_HI) return true;
  return false;
}

function normalizeIcao24(value: string | undefined): string | null {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^['"]|['"]$/g, "");
  if (!normalized) return null;
  if (!/^[0-9a-f]+$/i.test(normalized)) return null;
  return normalized.length < 6 ? normalized.padStart(6, "0") : normalized;
}

function parseRow(line: string) {
  try {
    const o = JSON.parse(line);
    if (!o.i) return null;
    return {
      icao24: o.i,
      typecode: o.tc,
      operator: o.op,
      military: classifyMilitary(o.i, o.tc, o.op),
    };
  } catch {
    return null;
  }
}

describe("classifyMilitary", () => {
  test("F-16 typecode is military", () => {
    expect(classifyMilitary("000001", "F16")).toBe(true);
  });
  test("C-17 typecode is military", () => {
    expect(classifyMilitary("000001", "C17")).toBe(true);
  });
  test("B737 is NOT military", () => {
    expect(classifyMilitary("000001", "B737")).toBe(false);
  });
  test("case insensitive typecode", () => {
    expect(classifyMilitary("000001", "f16")).toBe(true);
  });
  test("US Air Force operator", () => {
    expect(
      classifyMilitary("000001", undefined, "United States Air Force"),
    ).toBe(true);
  });
  test("Luftwaffe operator", () => {
    expect(classifyMilitary("000001", undefined, "Luftwaffe")).toBe(true);
  });
  test("Navy operator", () => {
    expect(classifyMilitary("000001", undefined, "Royal Navy")).toBe(true);
  });
  test("Delta Airlines is NOT military", () => {
    expect(classifyMilitary("000001", undefined, "Delta Air Lines")).toBe(
      false,
    );
  });
  test("US DoD hex AE0000", () => {
    expect(classifyMilitary("ae0000")).toBe(true);
  });
  test("US DoD hex AFFFFF", () => {
    expect(classifyMilitary("afffff")).toBe(true);
  });
  test("below DoD range", () => {
    expect(classifyMilitary("adffff")).toBe(false);
  });
  test("above DoD range", () => {
    expect(classifyMilitary("b00000")).toBe(false);
  });
  test("civilian with no signals", () => {
    expect(classifyMilitary("a12345", "B738", "Southwest Airlines")).toBe(
      false,
    );
  });
  test("any single signal suffices", () => {
    expect(classifyMilitary("000001", "PRED")).toBe(true);
    expect(classifyMilitary("000001", undefined, "Army")).toBe(true);
    expect(classifyMilitary("ae5000")).toBe(true);
  });
});

describe("normalizeIcao24", () => {
  test("lowercases", () => {
    expect(normalizeIcao24("ABC123")).toBe("abc123");
  });
  test("pads short hex", () => {
    expect(normalizeIcao24("abc")).toBe("000abc");
  });
  test("trims whitespace", () => {
    expect(normalizeIcao24("  abc123  ")).toBe("abc123");
  });
  test("strips quotes", () => {
    expect(normalizeIcao24("'abc123'")).toBe("abc123");
  });
  test("rejects non-hex", () => {
    expect(normalizeIcao24("xyz123")).toBeNull();
  });
  test("rejects empty", () => {
    expect(normalizeIcao24("")).toBeNull();
  });
  test("rejects undefined", () => {
    expect(normalizeIcao24(undefined)).toBeNull();
  });
});

describe("parseRow", () => {
  test("parses valid NDJSON", () => {
    const r = parseRow('{"i":"abc123","tc":"B738","op":"Delta"}');
    expect(r!.icao24).toBe("abc123");
    expect(r!.military).toBe(false);
  });
  test("classifies military", () => {
    expect(
      parseRow('{"i":"ae5000","tc":"F16","op":"US Air Force"}')!.military,
    ).toBe(true);
  });
  test("rejects missing icao", () => {
    expect(parseRow('{"tc":"B738"}')).toBeNull();
  });
  test("rejects invalid JSON", () => {
    expect(parseRow("not json")).toBeNull();
  });
});
