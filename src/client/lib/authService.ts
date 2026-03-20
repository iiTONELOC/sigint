// ── Auth service ─────────────────────────────────────────────────────
// Token lives in an HttpOnly cookie set by the server — never in JS.
// The browser includes it automatically on same-origin requests.
// On 401, we hit the token endpoint to get a fresh cookie, then retry.

const TOKEN_URL = "/api/auth/token";

async function refreshCookie(): Promise<void> {
  const res = await fetch(TOKEN_URL, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
}

export async function authenticatedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  let response = await fetch(url, {
    ...init,
    credentials: "same-origin",
  });

  if (response.status === 401) {
    await refreshCookie();
    response = await fetch(url, {
      ...init,
      credentials: "same-origin",
    });
  }

  return response;
}
