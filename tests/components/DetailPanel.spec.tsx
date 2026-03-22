import { describe, test, expect } from "bun:test";

// Test pure helper logic from DetailPanel.tsx

function isUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://");
}

describe("DetailPanel isUrl", () => {
  test("https URL", () => {
    expect(isUrl("https://example.com")).toBe(true);
  });
  test("http URL", () => {
    expect(isUrl("http://example.com")).toBe(true);
  });
  test("plain text", () => {
    expect(isUrl("not a url")).toBe(false);
  });
  test("ftp not a url", () => {
    expect(isUrl("ftp://files.com")).toBe(false);
  });
  test("empty string", () => {
    expect(isUrl("")).toBe(false);
  });
  test("partial https", () => {
    expect(isUrl("https:")).toBe(false);
  });
  test("javascript: protocol rejected", () => {
    expect(isUrl("javascript:alert(1)")).toBe(false);
  });
});
