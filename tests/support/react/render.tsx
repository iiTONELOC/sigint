import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

enum ReactTestElementTag {
  Container = "div",
}
type MountedReactRoot = Readonly<{
  container: HTMLDivElement;
  root: Root;
}>;

export type ReactRenderResult = Readonly<{
  container: HTMLDivElement;
  rerender: (element: ReactElement) => void;
  unmount: () => void;
}>;

const mountedReactRoots = new Set<MountedReactRoot>();

function unmountReactRoot(mountedRoot: MountedReactRoot): void {
  if (!mountedReactRoots.delete(mountedRoot)) {
    return;
  }

  act(() => {
    mountedRoot.root.unmount();
  });
  mountedRoot.container.remove();
}

/** Unmount every root that a React test did not already release. */
export function cleanupReactRoots(): void {
  for (const mountedRoot of mountedReactRoots) {
    unmountReactRoot(mountedRoot);
  }
}

/** Render an element and return its container, rerender action, and cleanup action. */
export function renderReact(element: ReactElement): ReactRenderResult {
  const container = document.createElement(ReactTestElementTag.Container);
  const root = createRoot(container);
  const mountedRoot = { container, root };
  const rerender = (nextElement: ReactElement): void => {
    act(() => {
      root.render(nextElement);
    });
  };
  const unmount = (): void => {
    unmountReactRoot(mountedRoot);
  };

  document.body.append(container);
  mountedReactRoots.add(mountedRoot);
  rerender(element);

  return { container, rerender, unmount };
}
