import { describe, expect, test } from "bun:test";
import {
  parseProductHtml,
  reflowWrappedProse,
} from "../../../src/server/api/cyclonesDossierCache";
import { CycloneDossierProductKind } from "@shared/domain/cyclones";

const DISCUSSION = [
  "Lowell is starting its forecast westward turn. The initial motion ",
  "is 305/4 kt, and the cyclone should start a westward motion within ",
  "the next 12 h. A general westward motion should continue for the ",
  "next 2-3 days.",
  " ",
  " ",
  "FORECAST POSITIONS AND MAX WINDS",
  " ",
  "INIT  28/2100Z 12.5N 133.4W   40 KT  45 MPH",
  " 12H  29/0600Z 12.6N 134.0W   40 KT  45 MPH",
  " 24H  29/1800Z 12.8N 135.4W   45 KT  50 MPH",
  "",
  "Forecaster Beven",
].join("\n");

describe("cyclone product text reflow", () => {
  test("joins hard-wrapped prose and keeps the forecast table rows", () => {
    const lines = reflowWrappedProse(DISCUSSION).split("\n");
    expect(lines[0]).toBe(
      "Lowell is starting its forecast westward turn. The initial motion is 305/4 kt, " +
        "and the cyclone should start a westward motion within the next 12 h. " +
        "A general westward motion should continue for the next 2-3 days.",
    );
    expect(lines).toContain("INIT  28/2100Z 12.5N 133.4W   40 KT  45 MPH");
    expect(lines).toContain(" 12H  29/0600Z 12.6N 134.0W   40 KT  45 MPH");
    expect(lines.at(-1)).toBe("Forecaster Beven");
  });

  test("collapses whitespace-only separators to one blank line", () => {
    const lines = reflowWrappedProse(DISCUSSION).split("\n");
    expect(lines.some((line) => line === " ")).toBe(false);
    expect(lines.slice(1, 3)).toEqual(["", "FORECAST POSITIONS AND MAX WINDS"]);
  });

  test("parseProductHtml reflows the bulletin body", () => {
    const html = `<html><pre>\nZCZC MIATCDEP5 ALL\nTTAA00 KNHC 282039\n\nTropical Storm Lowell Discussion Number   6\nNWS National Hurricane Center Miami FL       EP132026\n300 PM PDT Fri Aug 28 2026\n\n${DISCUSSION}\n$$\nNNNN\n</pre></html>`;
    const product = parseProductHtml(html, CycloneDossierProductKind.Discussion);
    expect(product?.advisoryNumber).toBe("6");
    expect(product?.body).toContain("within the next 12 h. A general");
    expect(product?.body).not.toContain("within \nthe next");
  });
});
