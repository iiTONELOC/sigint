import {
  test,
  expect,
  type Page,
  type Response as PlaywrightResponse,
} from "@playwright/test";
import { mockCyclones, installDefaultMocks } from "./helpers/fixtures";

enum AuthRoute {
  Protected = "/api/dossier/aircraft/ZZZZZZ",
  Token = "/api/auth/token",
}

enum AuthCookieValue {
  Name = "sigint_token",
  Path = "/api",
  SameSite = "Strict",
}

enum AuthRequestCredentials {
  SameOrigin = "same-origin",
}

enum HttpMethod {
  Get = "GET",
}

enum HttpStatus {
  BadRequest = 400,
  Ok = 200,
  Unauthorized = 401,
}

enum PlaywrightServiceWorkerPolicy {
  Block = "block",
}

enum AuthWaitMs {
  TokenResponse = 5_000,
}

async function waitForAuthToken(page: Page): Promise<PlaywrightResponse> {
  return page.waitForResponse(
    (res) =>
      res.url().endsWith(AuthRoute.Token) &&
      res.request().method() === HttpMethod.Get,
    { timeout: AuthWaitMs.TokenResponse },
  );
}

async function requestStatus(page: Page, route: AuthRoute): Promise<number> {
  return page.evaluate(async (request) => {
    const response = await fetch(request.route, {
      credentials: request.credentials,
    });
    return response.status;
  }, {
    route,
    credentials: AuthRequestCredentials.SameOrigin,
  });
}

test.describe("auth", () => {
  test.use({ serviceWorkers: PlaywrightServiceWorkerPolicy.Block });

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
    const token = cookies.find((cookie) => cookie.name === AuthCookieValue.Name);
    expect(token).toBeDefined();
    expect(token?.httpOnly).toBe(true);
    expect(token?.sameSite).toBe(AuthCookieValue.SameSite);
    expect(token?.path).toBe(AuthCookieValue.Path);
  });

  test("a re-issued token authorizes a retry after rejection", async ({
    page,
    context,
  }) => {
    await installDefaultMocks(page);
    await mockCyclones(page, "empty-out-of-season");
    const authPromise = waitForAuthToken(page);
    await page.goto("/");
    await authPromise;

    await context.clearCookies();

    const rejectedStatus = await requestStatus(page, AuthRoute.Protected);
    expect(rejectedStatus).toBe(HttpStatus.Unauthorized);

    const reissueStatus = await requestStatus(page, AuthRoute.Token);
    expect(reissueStatus).toBe(HttpStatus.Ok);

    const retriedStatus = await requestStatus(page, AuthRoute.Protected);
    expect(retriedStatus).toBe(HttpStatus.BadRequest);

    const cookies = await context.cookies();
    const token = cookies.find((cookie) => cookie.name === AuthCookieValue.Name);
    expect(token).toBeDefined();
  });
});
