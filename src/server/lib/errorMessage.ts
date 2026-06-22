// One owner for the `err instanceof Error ? err.message : fallback` idiom that
// every cache catch-block repeated. Keeps error-to-string conversion uniform.

/** Message from an unknown thrown value, or `fallback` when it isn't an Error. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
