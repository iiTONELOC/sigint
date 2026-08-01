export type FetchMockImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type RestoreFetch = () => void;

/** Install a typed fetch mock and return its restore action. */
export function installFetchMock(
  implementation: FetchMockImplementation,
): RestoreFetch {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(implementation, {
    preconnect: originalFetch.preconnect,
  });

  return () => {
    globalThis.fetch = originalFetch;
  };
}
