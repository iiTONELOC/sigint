import { describe, expect, test } from "bun:test";
import type { AircraftRouteWaypoint } from "@shared/domain/aircraftDossier";
import {
  parseNavData,
  resolveFiledRoute,
} from "../../src/server/api/filedRoute";

const KLAL_POINT: AircraftRouteWaypoint = [28, -82];
const KLAL = { code: "KLAL", point: KLAL_POINT };
const NOWHERE = { code: "", point: null };

const NAV = parseNavData({
  fixes: {
    NITTS: [[28.7, -82.5]],
    PATOY: [[29.5, -84.5]],
    DEANR: [[30, -85]],
    MICES: [[30.5, -85.5]],
    JAWJA: [[31, -86]],
    DUPED: [[60, 10], [28.5, -83]],
    NUTZE: [[37, -77]],
    KOHLS: [[37.1, -76.6]],
    LOOSE: [[35.5, -80.5]],
    DEVAC: [[35.8, -80]],
  },
  airways: {
    Q116: [
      ["ANC", "PATOY", "OCTAL"],
      ["SGF", "JAWJA", "MICES", "DEANR", "PATOY", "OCTAL"],
    ],
  },
  procedures: {
    "KCLT TRYTN4": { RW18C: ["NOPE1"], "": ["LOOSE"], DEVAC: ["DEVAC"] },
    "KPHF KOHLS1": { NUTZE: ["NUTZE", "KOHLS"], RW07: ["NOPE2"] },
  },
});

const KCLT_POINT: AircraftRouteWaypoint = [35.2, -80.9];
const KPHF_POINT: AircraftRouteWaypoint = [37.1, -76.5];
const KCLT = { code: "KCLT", point: KCLT_POINT };
const KPHF = { code: "KPHF", point: KPHF_POINT };

describe("filed route resolution", () => {
  test("expands the airway sequence that holds both its entry and exit", () => {
    expect(resolveFiledRoute(NAV, KLAL, "NITTS PATOY Q116 JAWJA", KLAL)?.waypoints).toEqual([
      [28, -82],
      [28.7, -82.5],
      [29.5, -84.5],
      [30, -85],
      [30.5, -85.5],
      [31, -86],
      [28, -82],
    ]);
  });

  const fromKlal: readonly (readonly [string, string, AircraftRouteWaypoint[]])[] = [
    ["picks the duplicate fix nearest the previous point", "DUPED", [[28, -82], [28.5, -83]]],
    ["ignores a procedure filed at the wrong airport", "KOHLS1 NUTZE", [[28, -82], [37, -77]]],
  ];

  test.each(fromKlal)("%s", (_name, route, expected) => {
    expect(resolveFiledRoute(NAV, KLAL, route, NOWHERE)?.waypoints).toEqual(expected);
  });

  test("skips tokens that are not fixes, airways, or coordinates", () => {
    expect(resolveFiledRoute(NAV, KLAL, "DCT BATTA1 constructor __proto__", KLAL)?.waypoints).toBeUndefined();
  });

  test("resolves coordinate fixes without nav data", () => {
    expect(resolveFiledRoute(null, KLAL, "2858N/08628W", NOWHERE)?.waypoints).toEqual([
      [28, -82],
      [28 + 58 / 60, -(86 + 28 / 60)],
    ]);
  });

  test("expands a SID at the origin and a STAR at the destination through their transitions", () => {
    expect(resolveFiledRoute(NAV, KCLT, "TRYTN4 DEVAC NUTZE KOHLS1", KPHF)?.waypoints).toEqual([
      [35.2, -80.9],
      [35.5, -80.5],
      [35.8, -80],
      [37, -77],
      [37.1, -76.6],
      [37.1, -76.5],
    ]);
  });

  test("rejects malformed nav data", () => {
    expect(parseNavData({ fixes: { BAD: [[999, 0]] }, airways: {}, procedures: {} })).toBeNull();
    expect(parseNavData({ fixes: {}, airways: { Q1: [1] }, procedures: {} })).toBeNull();
    expect(parseNavData({ fixes: {}, airways: { Q1: [[1]] }, procedures: {} })).toBeNull();
    expect(parseNavData({ fixes: {}, airways: {}, procedures: { "K A1": { "": [1] } } })).toBeNull();
    expect(parseNavData("nope")).toBeNull();
  });
});
