import { authenticatedFetch } from "@/lib/net/authService";
import { type EncyclopediaRoute } from "@shared/domain/encyclopedia";

type EncyclopediaParams = Readonly<Record<string, string | undefined>>;

const answerByUrl = new Map<string, Promise<unknown>>();

async function requestAnswer<T>(url: string): Promise<T | undefined> {
  const res = await authenticatedFetch(url);
  if (!res.ok) return undefined;
  return (await res.json()) as T;
}

function answerUrl(route: EncyclopediaRoute, params: EncyclopediaParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return `${route}?${query}`;
}

export function fetchEncyclopedia<T>(
  route: EncyclopediaRoute,
  params: EncyclopediaParams,
): Promise<T | null> {
  const url = answerUrl(route, params);
  const known = answerByUrl.get(url);
  if (known) return known as Promise<T | null>;
  const forget = (): null => {
    answerByUrl.delete(url);
    return null;
  };
  const pending = requestAnswer<T>(url).then(
    (answer) => (answer === undefined ? forget() : answer),
    forget,
  );
  answerByUrl.set(url, pending);
  return pending;
}

export function __resetEncyclopediaArticlesForTests(): void {
  answerByUrl.clear();
}
