import { createElement, type ReactElement } from "react";
import { ReactHookResultUnavailableError } from "./errors";
import { renderReact } from "./render";
import { waitForReact } from "./wait";

type ReactHookState<T> =
  | Readonly<{ ready: false }>
  | Readonly<{ ready: true; current: T }>;

type ReactHookValue<T> = Readonly<{
  current: T;
}>;

export type ReactHookOptions = Readonly<{
  wrapper?: (probe: ReactElement) => ReactElement;
}>;

export type ReactHookResult<T> = Readonly<{
  result: ReactHookValue<T>;
  waitFor: typeof waitForReact;
  unmount: () => void;
}>;

/** Render a hook and return its result, wait action, and cleanup action. */
export function renderHook<T>(
  hook: () => T,
  options: ReactHookOptions = {},
): ReactHookResult<T> {
  let hookState: ReactHookState<T> = { ready: false };

  function HookProbe(): null {
    hookState = { ready: true, current: hook() };
    return null;
  }

  const probe = createElement(HookProbe);
  const rendered = renderReact(options.wrapper?.(probe) ?? probe);
  const result: ReactHookValue<T> = {
    get current(): T {
      if (!hookState.ready) {
        throw new ReactHookResultUnavailableError();
      }
      return hookState.current;
    },
  };

  return {
    result,
    waitFor: waitForReact,
    unmount: rendered.unmount,
  };
}
