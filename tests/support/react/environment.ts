enum ReactTestEnvironmentKey {
  ActEnvironment = "IS_REACT_ACT_ENVIRONMENT",
}
/** Enable React act checks for the Bun test process. */
export function configureReactTestEnvironment(): void {
  Object.defineProperty(globalThis, ReactTestEnvironmentKey.ActEnvironment, {
    configurable: true,
    value: true,
    writable: true,
  });
}
