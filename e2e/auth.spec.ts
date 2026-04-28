import { test, expect } from "@playwright/test";
import { mockCyclones, installDefaultMocks } from "./helpers/fixtures";

// Auth: token cookie issued on first navigation. The cookie is HttpOnly
// + SameSite=Strict + Path=/api + Secure (Secure is OK on localhost; the
// cookie store accepts it regardless of viewport profile).
//
// Anchoring: the boot sequence calls ensureAuthCookie() asynchronously
// after the shell paints, so reading context.cookies() right after a
// canvas wait races the auth round-trip on slower mobile profiles.
// We wait for the actual /api/auth/token response before assertion.

async function waitForAuthToken(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (res) =>
      res.url().includes("/api/auth/token") && res.request().method() === "GET",
    { timeout: 5_000 },
  );
}

test.describe("auth", () => {
  test("/api/auth/token sets sigint_token cookie", async ({
    page,
    context,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, "empty-out-of-season");
    const authPromise = waitForAuthToken(page);
    await page.goto("/");
    await authPromise;

    const cookies = await context.cookies();
    const tok = cookies.find((c) => c.name === "sigint_token");
    expect(tok).toBeDefined();
    expect(tok?.httpOnly).toBe(true);
    expect(tok?.sameSite).toMatch(/Strict/i);
    expect(tok?.path).toBe("/api");
  });

  test("401 on a protected route triggers re-issue + retry", async ({
    page,
    context,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, "empty-out-of-season");
    let authPromise = waitForAuthToken(page);
    await page.goto("/");
    await authPromise;

    // Drop the cookie to force the next protected fetch to 401, which
    // should kick the cookie refresh path.
    await context.clearCookies();

    authPromise = waitForAuthToken(page);
    await page.reload();
    await authPromise;

    const cookies = await context.cookies();
    const tok = cookies.find((c) => c.name === "sigint_token");
    expect(tok).toBeDefined();
  });
});
