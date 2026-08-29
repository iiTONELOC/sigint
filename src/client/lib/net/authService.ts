import { AUTH_TOKEN_ROUTE, HttpStatus } from "@shared/http";

const AUTH_REQUEST_CREDENTIALS: RequestCredentials = "same-origin";
const TOKEN_REFRESH_FAILURE = "Token refresh failed";

class AuthServiceError extends Error {
  readonly kind = TOKEN_REFRESH_FAILURE;

  constructor(readonly httpStatus: number) {
    super(`${TOKEN_REFRESH_FAILURE}: ${httpStatus}`);
  }
}

let inflightRefresh: Promise<void> | null = null;

async function refreshCookie(): Promise<void> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    const res = await fetch(AUTH_TOKEN_ROUTE, {
      credentials: AUTH_REQUEST_CREDENTIALS,
    });
    if (!res.ok) {
      throw new AuthServiceError(res.status);
    }
    // Allow Set-Cookie processing before retries.
    await new Promise((r) => setTimeout(r, 0));
  })();
  try {
    await inflightRefresh;
  } finally {
    inflightRefresh = null;
  }
}

/** Pre-fetch auth token cookie. Call before any authenticated requests. */
export async function ensureAuthCookie(): Promise<void> {
  return refreshCookie();
}

export async function authenticatedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  let response = await fetch(url, {
    ...init,
    credentials: AUTH_REQUEST_CREDENTIALS,
  });

  if (response.status === HttpStatus.Unauthorized) {
    await refreshCookie();
    response = await fetch(url, {
      ...init,
      credentials: AUTH_REQUEST_CREDENTIALS,
    });
  }

  return response;
}
