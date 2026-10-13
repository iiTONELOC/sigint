export enum ErrorText {
  Unknown = "Unknown error",
}

export function errorMessage(
  err: unknown,
  fallback: string = ErrorText.Unknown,
): string {
  return err instanceof Error ? err.message : fallback;
}
