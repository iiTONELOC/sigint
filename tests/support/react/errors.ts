enum ReactTestErrorText {
  HookResultMessage = "React hook result is not available.",
  HookResultName = "ReactHookResultUnavailableError",
  WaitTimeoutMessage = "React test wait timed out.",
  WaitTimeoutName = "ReactTestWaitTimeoutError",
}

function containsExpectedError(
  values: readonly unknown[],
  expectedMessage: string,
): boolean {
  return values.some((value) => {
    if (value instanceof Error) {
      return value.message.includes(expectedMessage);
    }
    return typeof value === "string" && value.includes(expectedMessage);
  });
}

/** Hide one named fixture error while preserving every unexpected console error. */
export function withExpectedReactError<T>(
  expectedMessage: string,
  action: () => T,
): T {
  const originalError = console.error;
  console.error = (...values: unknown[]) => {
    if (!containsExpectedError(values, expectedMessage)) {
      originalError(...values);
    }
  };
  try {
    return action();
  } finally {
    console.error = originalError;
  }
}

export class ReactHookResultUnavailableError extends Error {
  constructor() {
    super(ReactTestErrorText.HookResultMessage);
    this.name = ReactTestErrorText.HookResultName;
  }
}

export class ReactTestWaitTimeoutError extends Error {
  constructor() {
    super(ReactTestErrorText.WaitTimeoutMessage);
    this.name = ReactTestErrorText.WaitTimeoutName;
  }
}
