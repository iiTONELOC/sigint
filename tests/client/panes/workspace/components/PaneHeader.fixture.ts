enum PaneHeaderFixtureAttribute {
  Draggable = "draggable",
}

enum PaneHeaderFixtureCount {
  RequiredControls = 5,
}

enum PaneHeaderFixtureErrorMessage {
  ControlsMissing = "The expected pane-header controls did not render.",
  DragHandleMissing = "The pane drag handle did not render.",
}

export type PaneHeaderControls = Readonly<{
  close: HTMLButtonElement | undefined;
  fullscreen: HTMLButtonElement;
  minimize: HTMLButtonElement;
  splitHorizontal: HTMLButtonElement;
  splitVertical: HTMLButtonElement;
  type: HTMLButtonElement;
}>;

export function requirePaneHeaderControls(
  root: ParentNode,
): PaneHeaderControls {
  const buttons = Array.from(root.querySelectorAll("button"));
  const [
    type,
    splitHorizontal,
    splitVertical,
    fullscreen,
    minimize,
    close,
  ] = buttons;
  if (
    buttons.length < PaneHeaderFixtureCount.RequiredControls ||
    type === undefined ||
    splitHorizontal === undefined ||
    splitVertical === undefined ||
    fullscreen === undefined ||
    minimize === undefined
  ) {
    throw new TypeError(PaneHeaderFixtureErrorMessage.ControlsMissing);
  }
  return {
    close,
    fullscreen,
    minimize,
    splitHorizontal,
    splitVertical,
    type,
  };
}

export function requirePaneDragHandle(root: ParentNode): HTMLElement {
  const handle = root.querySelector(
    `[${PaneHeaderFixtureAttribute.Draggable}="true"]`,
  );
  if (!(handle instanceof HTMLElement)) {
    throw new TypeError(PaneHeaderFixtureErrorMessage.DragHandleMissing);
  }
  return handle;
}
