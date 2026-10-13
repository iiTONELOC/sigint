import { describe, expect, test } from "bun:test";
import { spacedUpperCase, spacedWords } from "@shared/text";

enum TextFixture {
  Camel = "EastPacific",
  CamelEvent = "gateOut",
  EventLabel = "GATE OUT",
  Single = "Atlantic",
  Spaced = "East Pacific",
}

describe("camel case words", () => {
  test("spacedWords splits at each lower-to-upper boundary and leaves a single word alone", () => {
    expect(spacedWords(TextFixture.Camel)).toBe(TextFixture.Spaced);
    expect(spacedWords(TextFixture.Single)).toBe(TextFixture.Single);
  });

  test("spacedUpperCase is the spaced form in upper case", () => {
    expect(spacedUpperCase(TextFixture.CamelEvent)).toBe(TextFixture.EventLabel);
    expect(spacedUpperCase(TextFixture.Camel)).toBe(TextFixture.Spaced.toUpperCase());
  });
});
