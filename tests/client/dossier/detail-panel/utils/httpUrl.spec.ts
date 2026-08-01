import { describe, expect, test } from "bun:test";
import {
  isHttpUrl,
} from "@/dossier/detail-panel/utils/httpUrl";

enum HttpUrlFixture {
  Empty = "",
  Ftp = "ftp://files.example",
  Http = "http://example.com",
  Https = "https://example.com",
  IncompleteHttps = "https:",
  Javascript = "javascript:alert(1)",
  PlainText = "not a URL",
}

describe("isHttpUrl", () => {
  test("accepts HTTP and HTTPS values", () => {
    expect(isHttpUrl(HttpUrlFixture.Http)).toBe(true);
    expect(isHttpUrl(HttpUrlFixture.Https)).toBe(true);
  });

  test("rejects other schemes and incomplete values", () => {
    expect(isHttpUrl(HttpUrlFixture.Empty)).toBe(false);
    expect(isHttpUrl(HttpUrlFixture.Ftp)).toBe(false);
    expect(isHttpUrl(HttpUrlFixture.IncompleteHttps)).toBe(false);
    expect(isHttpUrl(HttpUrlFixture.Javascript)).toBe(false);
    expect(isHttpUrl(HttpUrlFixture.PlainText)).toBe(false);
  });
});
