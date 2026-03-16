// ── Auth service ─────────────────────────────────────────────────────
// Single token shared across all authenticated API calls.
// Fetched once on first use, cached in memory, auto-refreshed on 401.

const TOKEN_URL = "/api/auth/token";

let authToken: string | null = null;

async function ensureToken(): Promise<string> {
  if (authToken) return authToken;
  const res = await fetch(TOKEN_URL);
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
  const json = await res.json();
  authToken = json.token;
  return authToken!;
}

async function refreshToken(): Promise<string> {
  authToken = null;
  return ensureToken();
}

export async function authenticatedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  let token = await ensureToken();
  let response = await fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      "X-SIGINT-Token": token,
    },
  });

  if (response.status === 401) {
    token = await refreshToken();
    response = await fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        "X-SIGINT-Token": token,
      },
    });
  }

  return response;
}
