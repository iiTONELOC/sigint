import { expect } from "bun:test";

enum ReactAriaAttribute {
  Busy = "aria-busy",
  Label = "aria-label",
}

enum ReactAriaValue {
  True = "true",
}

enum ReactElementSelector {
  Status = "output",
}

/** Verify the native busy status for a rendered React surface. */
export function expectBusyStatus(
  container: ParentNode,
  accessibleName: string,
): void {
  const status = container.querySelector(ReactElementSelector.Status);

  expect(status).not.toBeNull();
  expect(status?.getAttribute(ReactAriaAttribute.Label)).toBe(accessibleName);
  expect(status?.getAttribute(ReactAriaAttribute.Busy)).toBe(
    ReactAriaValue.True,
  );
}
