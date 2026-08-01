import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/ui/utils";
import { DomInputType, DomKey } from "@/runtime";
import {
  PaneLayoutRatio,
  PaneResizeMetric,
  PANE_RESIZE_AXIS_POLICY,
  SplitDirection,
  type SplitDirectionValue,
} from "@/panes/workspace/model";

enum ResizeBodyClass {
  SelectionDisabled = "select-none",
}

enum ResizeGripId {
  Leading = "resize-grip-leading",
  Middle = "resize-grip-middle",
  Trailing = "resize-grip-trailing",
}

enum ResizeHandleClass {
  Container = "touch-resize relative z-10 flex items-center justify-center touch-none transition-colors",
  Control = "peer absolute m-0 appearance-none border-0 opacity-0 touch-none",
  DragActive = "bg-sig-accent/40",
  DragIdle = "bg-sig-border/30 hover:bg-sig-accent/25",
  FocusRing = "pointer-events-none absolute inset-0 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-sig-bright",
  Grip = "flex gap-0.75 pointer-events-none",
  GripActive = "bg-sig-accent/80",
  GripDot = "rounded-full size-0.5",
  GripIdle = "bg-sig-dim/40",
}

enum ResizeKeyAction {
  Decrease = "decrease",
  Ignore = "ignore",
  Increase = "increase",
  Maximum = "maximum",
  Minimum = "minimum",
}

type ResizeDirectionClass = Readonly<{
  bodyCursor: string;
  gripDirection: string;
  hitArea: string;
  track: string;
}>;

const RESIZE_DIRECTION_CLASS: Readonly<
  Record<SplitDirectionValue, ResizeDirectionClass>
> = {
  [SplitDirection.Horizontal]: {
    bodyCursor: "cursor-col-resize",
    gripDirection: "flex-col",
    hitArea: "inset-y-0 start-1/2 w-11 -translate-x-1/2",
    track: "cursor-col-resize w-1.5",
  },
  [SplitDirection.Vertical]: {
    bodyCursor: "cursor-row-resize",
    gripDirection: "flex-row",
    hitArea: "inset-x-0 top-1/2 h-11 -translate-y-1/2",
    track: "cursor-row-resize h-1.5",
  },
};

type ResizeBounds = Readonly<{
  maximum: number;
  minimum: number;
}>;

type ResizeBodyState = Readonly<{
  cursorClass: string;
  cursorWasPresent: boolean;
  selectionWasPresent: boolean;
}>;

type ResizeGeometry = Readonly<{
  bounds: ResizeBounds;
  currentRatio: number;
  startOffset: number;
  totalSize: number;
}>;

type ResizeHandleProps = Readonly<{
  direction: SplitDirectionValue;
  onResize: (splitId: string, ratio: number) => void;
  splitId: string;
}>;

type ResizeSession = Readonly<{
  bodyState: ResizeBodyState;
  control: HTMLInputElement;
  geometry: ResizeGeometry;
  pointerId: number;
}>;

function isHorizontalSplit(direction: SplitDirectionValue): boolean {
  return direction === SplitDirection.Horizontal;
}

function axisSize(
  rectangle: DOMRect,
  direction: SplitDirectionValue,
): number {
  return isHorizontalSplit(direction) ? rectangle.width : rectangle.height;
}

function currentPaneRatio(
  handle: HTMLDivElement,
  direction: SplitDirectionValue,
): number {
  const leadingPane = handle.previousElementSibling;
  const trailingPane = handle.nextElementSibling;
  if (
    !(leadingPane instanceof HTMLElement) ||
    !(trailingPane instanceof HTMLElement)
  ) {
    return PaneLayoutRatio.Equal;
  }

  const leadingSize = axisSize(
    leadingPane.getBoundingClientRect(),
    direction,
  );
  const trailingSize = axisSize(
    trailingPane.getBoundingClientRect(),
    direction,
  );
  const paneSize = leadingSize + trailingSize;
  return paneSize > PaneResizeMetric.EmptyPixels
    ? leadingSize / paneSize
    : PaneLayoutRatio.Equal;
}

function minimumPanePixels(direction: SplitDirectionValue): number {
  return PANE_RESIZE_AXIS_POLICY[direction].minimumPixels;
}

function measureResize(
  handle: HTMLDivElement,
  direction: SplitDirectionValue,
): ResizeGeometry | null {
  const parent = handle.parentElement;
  if (parent === null) return null;

  const rect = parent.getBoundingClientRect();
  const totalSize = axisSize(rect, direction);
  if (totalSize <= PaneResizeMetric.EmptyPixels) return null;

  const minimum = Math.min(
    PaneResizeMetric.MaximumMinimumRatio,
    minimumPanePixels(direction) / totalSize,
  );

  return {
    bounds: {
      maximum: PaneResizeMetric.RatioUnit - minimum,
      minimum,
    },
    currentRatio: currentPaneRatio(handle, direction),
    startOffset: isHorizontalSplit(direction) ? rect.left : rect.top,
    totalSize,
  };
}

function clampRatio(ratio: number, bounds: ResizeBounds): number {
  return Math.max(bounds.minimum, Math.min(bounds.maximum, ratio));
}

function pointerPosition(
  event: ReactPointerEvent<HTMLInputElement>,
  direction: SplitDirectionValue,
): number {
  return isHorizontalSplit(direction) ? event.clientX : event.clientY;
}

function resizeKeyAction(
  key: string,
  direction: SplitDirectionValue,
): ResizeKeyAction | null {
  switch (key) {
    case DomKey.Home:
      return ResizeKeyAction.Minimum;
    case DomKey.End:
      return ResizeKeyAction.Maximum;
    case DomKey.ArrowLeft:
      return isHorizontalSplit(direction)
        ? ResizeKeyAction.Decrease
        : ResizeKeyAction.Ignore;
    case DomKey.ArrowRight:
      return isHorizontalSplit(direction)
        ? ResizeKeyAction.Increase
        : ResizeKeyAction.Ignore;
    case DomKey.ArrowUp:
      return isHorizontalSplit(direction)
        ? ResizeKeyAction.Ignore
        : ResizeKeyAction.Decrease;
    case DomKey.ArrowDown:
      return isHorizontalSplit(direction)
        ? ResizeKeyAction.Ignore
        : ResizeKeyAction.Increase;
    default:
      return null;
  }
}

function keyboardRatio(
  action: ResizeKeyAction,
  ratio: number,
  bounds: ResizeBounds,
): number {
  switch (action) {
    case ResizeKeyAction.Minimum:
      return bounds.minimum;
    case ResizeKeyAction.Maximum:
      return bounds.maximum;
    case ResizeKeyAction.Decrease:
      return clampRatio(
        ratio - PaneResizeMetric.KeyboardStep,
        bounds,
      );
    case ResizeKeyAction.Increase:
      return clampRatio(
        ratio + PaneResizeMetric.KeyboardStep,
        bounds,
      );
    case ResizeKeyAction.Ignore:
      return ratio;
  }
}

function startBodyResize(
  direction: SplitDirectionValue,
): ResizeBodyState {
  const cursorClass = RESIZE_DIRECTION_CLASS[direction].bodyCursor;
  const cursorWasPresent = document.body.classList.contains(cursorClass);
  const selectionWasPresent = document.body.classList.contains(
    ResizeBodyClass.SelectionDisabled,
  );
  document.body.classList.add(
    cursorClass,
    ResizeBodyClass.SelectionDisabled,
  );
  return { cursorClass, cursorWasPresent, selectionWasPresent };
}

function stopBodyResize(bodyState: ResizeBodyState): void {
  if (!bodyState.cursorWasPresent) {
    document.body.classList.remove(bodyState.cursorClass);
  }
  if (!bodyState.selectionWasPresent) {
    document.body.classList.remove(ResizeBodyClass.SelectionDisabled);
  }
}

export function ResizeHandle({
  direction,
  onResize,
  splitId,
}: ResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<ResizeSession | null>(null);
  const [controlRatio, setControlRatio] = useState<number>(
    PaneLayoutRatio.Equal,
  );
  const [dragging, setDragging] = useState(false);

  const syncControlRatio = useCallback(() => {
    const handle = handleRef.current;
    if (handle === null) return;
    const geometry = measureResize(handle, direction);
    if (geometry === null) return;
    setControlRatio((current) =>
      current === geometry.currentRatio ? current : geometry.currentRatio,
    );
  }, [direction]);

  useLayoutEffect(syncControlRatio);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>) => {
      const handle = handleRef.current;
      if (handle === null || sessionRef.current !== null) return;
      const geometry = measureResize(handle, direction);
      if (geometry === null) return;

      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      sessionRef.current = {
        bodyState: startBodyResize(direction),
        control: event.currentTarget,
        geometry,
        pointerId: event.pointerId,
      };
      setControlRatio(geometry.currentRatio);
      setDragging(true);
    },
    [direction],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>) => {
      const session = sessionRef.current;
      if (session?.pointerId !== event.pointerId) return;

      const rawRatio =
        (pointerPosition(event, direction) - session.geometry.startOffset) /
        session.geometry.totalSize;
      const nextRatio = clampRatio(rawRatio, session.geometry.bounds);
      setControlRatio(nextRatio);
      onResize(splitId, nextRatio);
    },
    [direction, onResize, splitId],
  );

  const finishPointerResize = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>) => {
      const session = sessionRef.current;
      if (session?.pointerId !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      sessionRef.current = null;
      stopBodyResize(session.bodyState);
      setDragging(false);
    },
    [],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const action = resizeKeyAction(event.key, direction);
      const handle = handleRef.current;
      if (action === null || handle === null) return;
      const geometry = measureResize(handle, direction);
      if (geometry === null) return;

      event.preventDefault();
      if (action === ResizeKeyAction.Ignore) return;
      const nextRatio = keyboardRatio(
        action,
        geometry.currentRatio,
        geometry.bounds,
      );
      setControlRatio(nextRatio);
      onResize(splitId, nextRatio);
    },
    [direction, onResize, splitId],
  );

  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (session?.control.hasPointerCapture(session.pointerId)) {
        session.control.releasePointerCapture(session.pointerId);
      }
      if (session !== null) stopBodyResize(session.bodyState);
      sessionRef.current = null;
    },
    [],
  );

  const directionClass = RESIZE_DIRECTION_CLASS[direction];
  const dragClass = dragging
    ? ResizeHandleClass.DragActive
    : ResizeHandleClass.DragIdle;
  const gripClass = dragging
    ? ResizeHandleClass.GripActive
    : ResizeHandleClass.GripIdle;

  return (
    <div
      ref={handleRef}
      className={cn(
        ResizeHandleClass.Container,
        directionClass.track,
        dragClass,
      )}
    >
      <input
        aria-label={PANE_RESIZE_AXIS_POLICY[direction].accessibleName}
        className={cn(ResizeHandleClass.Control, directionClass.hitArea)}
        max={PaneResizeMetric.FullPercent}
        min={PaneResizeMetric.EmptyPixels}
        onFocus={syncControlRatio}
        onKeyDown={onKeyDown}
        onLostPointerCapture={finishPointerResize}
        onPointerCancel={finishPointerResize}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointerResize}
        readOnly
        step={
          PaneResizeMetric.KeyboardStep * PaneResizeMetric.FullPercent
        }
        type={DomInputType.Range}
        value={Math.round(controlRatio * PaneResizeMetric.FullPercent)}
      />
      <div aria-hidden className={ResizeHandleClass.FocusRing} />
      <div
        aria-hidden
        className={cn(
          ResizeHandleClass.Grip,
          directionClass.gripDirection,
        )}
      >
        {Object.values(ResizeGripId).map((gripId) => (
          <div
            key={gripId}
            className={cn(ResizeHandleClass.GripDot, gripClass)}
          />
        ))}
      </div>
    </div>
  );
}
