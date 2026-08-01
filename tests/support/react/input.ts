import { act } from "react";
import { DomEvent } from "@/runtime";

enum ReactInputProperty {
  Value = "value",
}

enum ReactInputTestErrorMessage {
  ValueSetterMissing = "The native input value setter is unavailable.",
}

/** Set a controlled React input through its native browser boundary. */
export function setReactInputValue(
  input: HTMLInputElement,
  value: string,
): void {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    ReactInputProperty.Value,
  )?.set;
  if (valueSetter === undefined) {
    throw new TypeError(ReactInputTestErrorMessage.ValueSetterMissing);
  }

  act(() => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event(DomEvent.Input, { bubbles: true }));
  });
}
