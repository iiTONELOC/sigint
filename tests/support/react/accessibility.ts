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

export type BusyStatus = Readonly<{ label: string | null; busy: boolean }>;

export function busyStatus(container: ParentNode): BusyStatus | null {
  const status = container.querySelector(ReactElementSelector.Status);
  if (!status) return null;
  return {
    label: status.getAttribute(ReactAriaAttribute.Label),
    busy: status.getAttribute(ReactAriaAttribute.Busy) === ReactAriaValue.True,
  };
}
