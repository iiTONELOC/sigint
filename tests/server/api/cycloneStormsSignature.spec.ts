import { describe, expect, test } from "bun:test";
import { computeStormsSignature } from "../../../src/server/api/cyclonesCache";

const storm = { id: "al092026", intensity: "100", publicAdvisory: { advNum: "013" } };

describe("computeStormsSignature", () => {
  test("changes when a storm changes without a new advisory number", () => {
    expect(computeStormsSignature([storm])).not.toBe(computeStormsSignature([{ ...storm, intensity: "105" }]));
  });

  test("ignores storm order and records without an id", () => {
    const other = { id: "ep182026", intensity: "40" };
    expect(computeStormsSignature([storm, other, { name: "no id" }])).toBe(computeStormsSignature([other, storm]));
  });
});
