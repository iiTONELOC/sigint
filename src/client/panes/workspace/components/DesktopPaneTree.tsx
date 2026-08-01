import {
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Satellite } from "lucide-react";
import { isSourceDelivering } from "@shared/domain/sourceStatus";
import type { SourceStatusEntry } from "@/lib/net/sourceHealth";
import { PaneHeader } from "@/panes/PaneHeader";
import { ResizeHandle } from "@/panes/ResizeHandle";
import { SplitMenu } from "@/panes/SplitMenu";
import {
  leafCount,
  type LayoutNode,
  type LeafNode,
  type PaneType,
  type SplitNode,
} from "@/panes/paneTree";
import {
  PaneDragEffect,
  PaneDropZone,
  PaneNodeType,
  PaneType as PaneTypeId,
  PaneWorkspaceIconMetric,
  PaneWorkspaceMenuMetric,
  SplitDirection,
  type PaneDropZoneValue,
  type PaneEdgeDropZoneValue,
  type SplitDirectionValue,
} from "@/panes/workspace/model";
import { PANE_CATALOG } from "@/panes/workspace/paneCatalog";
import { paneDropZoneForPoint } from "@/panes/workspace/utils/dropZone";
import { DomEvent } from "@/runtime";

enum DesktopPaneClassName {
  Ghost = "absolute z-20 pointer-events-none bg-[rgba(0,212,240,0.12)] border-2 border-[rgba(0,212,240,0.4)] rounded transition-all duration-100 ease-out",
  GhostBottom = "bottom-1 inset-x-1 h-[calc(50%_-_6px)]",
  GhostCenter = "inset-1",
  GhostLabel = "absolute inset-0 flex items-center justify-center text-sig-accent font-bold tracking-widest text-(length:--sig-text-btn) [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]",
  GhostLeft = "inset-y-1 left-1 w-[calc(50%_-_6px)]",
  GhostRight = "inset-y-1 right-1 w-[calc(50%_-_6px)]",
  GhostTop = "top-1 inset-x-1 h-[calc(50%_-_6px)]",
  Leaf = "flex flex-col min-w-0 min-h-0 overflow-hidden w-full h-full relative",
  NodeContent = "overflow-hidden min-w-0 min-h-0",
  PaneBody = "flex-1 relative overflow-hidden",
  Split = "w-full h-full min-w-0 min-h-0 overflow-hidden",
}

enum DesktopPaneCopy {
  InsertBottom = "↓ INSERT",
  InsertLeft = "← INSERT",
  InsertRight = "→ INSERT",
  InsertTop = "↑ INSERT",
  Live = "LIVE",
  Swap = "⇄ SWAP",
  Tracks = "TRACKS",
}

enum DesktopPaneErrorMessage {
  UnsupportedDropZone = "The pane drop zone is not supported.",
}

enum DesktopPaneMetric {
  SplitMenuOffsetPx = 4,
  SplitSeparatorPx = 6,
}

type DesktopPaneTreeProps = Readonly<{
  activeCount: number;
  availableTypes: PaneType[];
  changePaneType: (leafId: string, newType: PaneType) => void;
  closePane: (leafId: string) => void;
  dataSources: readonly SourceStatusEntry[];
  insertPaneBeside: (
    sourceLeafId: string,
    targetLeafId: string,
    zone: PaneEdgeDropZoneValue,
  ) => void;
  minimizePane: (leafId: string, paneType: PaneType) => void;
  resizeSplit: (splitId: string, ratio: number) => void;
  root: LayoutNode;
  splitPane: (
    leafId: string,
    direction: SplitDirectionValue,
    newType: PaneType,
  ) => void;
  swapPanes: (sourceLeafId: string, targetLeafId: string) => void;
}>;

type SplitMenuState = Readonly<{
  direction: SplitDirectionValue;
  leafId: string;
  left: number;
  top: number;
}>;

type DesktopPaneContext = Readonly<{
  activeCount: number;
  availableTypes: PaneType[];
  canClose: boolean;
  changePaneType: DesktopPaneTreeProps["changePaneType"];
  clearDrag: () => void;
  closePane: DesktopPaneTreeProps["closePane"];
  dataSources: readonly SourceStatusEntry[];
  dragSourceId: string | null;
  dragTargetId: string | null;
  dropOnPane: (targetLeafId: string) => void;
  dropZone: PaneDropZoneValue | null;
  insertPaneBeside: DesktopPaneTreeProps["insertPaneBeside"];
  minimizePane: DesktopPaneTreeProps["minimizePane"];
  openSplitMenu: (
    leafId: string,
    direction: SplitDirectionValue,
    event: MouseEvent,
  ) => void;
  resizeSplit: DesktopPaneTreeProps["resizeSplit"];
  setDragSourceId: (leafId: string) => void;
  setDragTarget: (
    leafId: string | null,
    zone: PaneDropZoneValue | null,
  ) => void;
}>;

type TouchDragOptions = Readonly<{
  clearDrag: () => void;
  dragSourceId: string | null;
  dragTargetId: string | null;
  dropZone: PaneDropZoneValue | null;
  insertPaneBeside: DesktopPaneTreeProps["insertPaneBeside"];
  setDragTarget: DesktopPaneContext["setDragTarget"];
  swapPanes: DesktopPaneTreeProps["swapPanes"];
}>;

type DesktopPaneDragHandlers = Readonly<{
  onDragLeave?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
}>;

function ghostClassName(zone: PaneDropZoneValue): DesktopPaneClassName {
  switch (zone) {
    case PaneDropZone.Center:
      return DesktopPaneClassName.GhostCenter;
    case PaneDropZone.Left:
      return DesktopPaneClassName.GhostLeft;
    case PaneDropZone.Right:
      return DesktopPaneClassName.GhostRight;
    case PaneDropZone.Top:
      return DesktopPaneClassName.GhostTop;
    case PaneDropZone.Bottom:
      return DesktopPaneClassName.GhostBottom;
    default:
      throw new TypeError(DesktopPaneErrorMessage.UnsupportedDropZone);
  }
}

function ghostLabel(zone: PaneDropZoneValue): DesktopPaneCopy {
  switch (zone) {
    case PaneDropZone.Center:
      return DesktopPaneCopy.Swap;
    case PaneDropZone.Left:
      return DesktopPaneCopy.InsertLeft;
    case PaneDropZone.Right:
      return DesktopPaneCopy.InsertRight;
    case PaneDropZone.Top:
      return DesktopPaneCopy.InsertTop;
    case PaneDropZone.Bottom:
      return DesktopPaneCopy.InsertBottom;
    default:
      throw new TypeError(DesktopPaneErrorMessage.UnsupportedDropZone);
  }
}

function paneOptions(currentType: PaneType) {
  return Object.values(PaneTypeId)
    .filter((paneType) => paneType !== currentType)
    .map((paneType) => ({
      icon: PANE_CATALOG[paneType].icon,
      id: paneType,
      label: PANE_CATALOG[paneType].label,
    }));
}

function paneAtPoint(
  clientX: number,
  clientY: number,
  dragSourceId: string,
): Readonly<{ id: string; zone: PaneDropZoneValue }> | null {
  const element = document.elementFromPoint(clientX, clientY);
  const paneElement = element?.closest<HTMLElement>("[data-pane-leaf-id]");
  const id = paneElement?.dataset.paneLeafId;
  if (!paneElement || !id || id === dragSourceId) {
    return null;
  }
  return {
    id,
    zone: paneDropZoneForPoint(
      clientX,
      clientY,
      paneElement.getBoundingClientRect(),
    ),
  };
}

function useTouchPaneDrag(options: TouchDragOptions): void {
  useEffect(() => {
    if (!options.dragSourceId) {
      return;
    }

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || !options.dragSourceId) {
        options.setDragTarget(null, null);
        return;
      }
      const target = paneAtPoint(
        touch.clientX,
        touch.clientY,
        options.dragSourceId,
      );
      options.setDragTarget(target?.id ?? null, target?.zone ?? null);
    };
    const onTouchEnd = () => {
      if (
        options.dragSourceId &&
        options.dragTargetId &&
        options.dropZone
      ) {
        if (options.dropZone === PaneDropZone.Center) {
          options.swapPanes(options.dragSourceId, options.dragTargetId);
        } else {
          options.insertPaneBeside(
            options.dragSourceId,
            options.dragTargetId,
            options.dropZone,
          );
        }
      }
      options.clearDrag();
    };

    window.addEventListener(DomEvent.TouchMove, onTouchMove, { passive: true });
    window.addEventListener(DomEvent.TouchEnd, onTouchEnd);
    window.addEventListener(DomEvent.TouchCancel, onTouchEnd);
    return () => {
      window.removeEventListener(DomEvent.TouchMove, onTouchMove);
      window.removeEventListener(DomEvent.TouchEnd, onTouchEnd);
      window.removeEventListener(DomEvent.TouchCancel, onTouchEnd);
    };
  }, [options]);
}

function useSplitMenuDismissal(
  splitMenu: SplitMenuState | null,
  splitMenuRef: RefObject<HTMLDivElement | null>,
  closeSplitMenu: () => void,
): void {
  useEffect(() => {
    if (!splitMenu) {
      return;
    }
    const dismiss = (event: globalThis.MouseEvent) => {
      if (!splitMenuRef.current?.contains(event.target as Node)) {
        closeSplitMenu();
      }
    };
    document.addEventListener(DomEvent.MouseDown, dismiss);
    return () => document.removeEventListener(DomEvent.MouseDown, dismiss);
  }, [closeSplitMenu, splitMenu, splitMenuRef]);
}

function splitStyle(node: SplitNode): CSSProperties {
  const property =
    node.direction === SplitDirection.Horizontal
      ? "gridTemplateColumns"
      : "gridTemplateRows";
  return {
    display: "grid",
    [property]: `${node.ratio}fr ${DesktopPaneMetric.SplitSeparatorPx}px ${1 - node.ratio}fr`,
  };
}

function dragHandlers(
  isDragOver: boolean,
  leafId: string,
  context: DesktopPaneContext,
): DesktopPaneDragHandlers {
  if (!isDragOver) {
    return {};
  }
  return {
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
        context.setDragTarget(null, null);
      }
    },
    onDragOver: (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = PaneDragEffect.Move;
      context.setDragTarget(
        leafId,
        paneDropZoneForPoint(
          event.clientX,
          event.clientY,
          event.currentTarget.getBoundingClientRect(),
        ),
      );
    },
    onDrop: (event) => {
      event.preventDefault();
      context.dropOnPane(leafId);
    },
  };
}

function splitHandler(
  context: DesktopPaneContext,
  leafId: string,
  direction: SplitDirectionValue,
): ((event: MouseEvent) => void) | undefined {
  if (context.availableTypes.length === 0) {
    return undefined;
  }
  return (event) => context.openSplitMenu(leafId, direction, event);
}

function DesktopPaneGhost({
  zone,
}: Readonly<{ zone: PaneDropZoneValue | null }>) {
  if (!zone) {
    return null;
  }
  return (
    <div
      className={`${DesktopPaneClassName.Ghost} ${ghostClassName(zone)}`}
    >
      <div className={DesktopPaneClassName.GhostLabel}>
        {ghostLabel(zone)}
      </div>
    </div>
  );
}

function DesktopGlobeStatus({
  activeCount,
  dataSources,
}: Readonly<{
  activeCount: number;
  dataSources: readonly SourceStatusEntry[];
}>) {
  const deliveringSources = dataSources.filter((source) =>
    isSourceDelivering(source.status),
  ).length;
  return (
    <>
      <Satellite
        size={PaneWorkspaceIconMetric.CompactSize}
        strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
        className="text-sig-accent"
      />
      <span className="text-sig-accent font-semibold tabular-nums">
        {activeCount.toLocaleString()}
      </span>
      <span className="hidden sm:inline tracking-wider">
        {DesktopPaneCopy.Tracks}
      </span>
      <span className="text-sig-dim hidden sm:inline">
        · {deliveringSources}/{dataSources.length} {DesktopPaneCopy.Live}
      </span>
    </>
  );
}

function DesktopLeafHeader({
  context,
  node,
}: Readonly<{ context: DesktopPaneContext; node: LeafNode }>) {
  const definition = PANE_CATALOG[node.paneType];
  const status =
    node.paneType === PaneTypeId.Globe ? (
      <DesktopGlobeStatus
        activeCount={context.activeCount}
        dataSources={context.dataSources}
      />
    ) : undefined;
  return (
    <PaneHeader
      label={definition.label}
      icon={definition.icon}
      leafId={node.id}
      paneType={node.paneType}
      statusSlot={status}
      onSplitH={splitHandler(context, node.id, SplitDirection.Horizontal)}
      onSplitV={splitHandler(context, node.id, SplitDirection.Vertical)}
      onMinimize={() => context.minimizePane(node.id, node.paneType)}
      onClose={context.canClose ? () => context.closePane(node.id) : undefined}
      onChangePaneType={(paneType) =>
        context.changePaneType(node.id, paneType)
      }
      paneOptions={paneOptions(node.paneType)}
      onDragStart={context.setDragSourceId}
      onDragEnd={context.clearDrag}
      onDrop={context.dropOnPane}
      onTouchDragStart={context.setDragSourceId}
      isDragTarget={
        context.dragSourceId !== null && context.dragSourceId !== node.id
      }
    />
  );
}

function DesktopPaneLeaf({
  context,
  node,
}: Readonly<{ context: DesktopPaneContext; node: LeafNode }>) {
  const definition = PANE_CATALOG[node.paneType];
  const PaneComponent = definition.component;
  const isDragOver =
    context.dragSourceId !== null && context.dragSourceId !== node.id;
  const isTarget = context.dragTargetId === node.id;
  const zone = isTarget ? context.dropZone : null;
  const handlers = dragHandlers(isDragOver, node.id, context);

  return (
    <div
      data-pane-leaf-id={node.id}
      data-tour={
        node.paneType === PaneTypeId.Globe ? "globe-pane" : undefined
      }
      className={DesktopPaneClassName.Leaf}
      onDragLeave={handlers.onDragLeave}
      onDragOver={handlers.onDragOver}
      onDrop={handlers.onDrop}
    >
      <DesktopPaneGhost zone={zone} />
      <div className="relative">
        <DesktopLeafHeader context={context} node={node} />
      </div>
      <div className={DesktopPaneClassName.PaneBody}>
        <PaneComponent />
      </div>
    </div>
  );
}

function DesktopPaneNode({
  context,
  node,
}: Readonly<{ context: DesktopPaneContext; node: LayoutNode }>) {
  if (node.type === PaneNodeType.Leaf) {
    return (
      <DesktopPaneLeaf
        key={node.paneType}
        context={context}
        node={node}
      />
    );
  }
  return (
    <div className={DesktopPaneClassName.Split} style={splitStyle(node)}>
      <div className={DesktopPaneClassName.NodeContent}>
        <DesktopPaneNode context={context} node={node.children[0]} />
      </div>
      <ResizeHandle
        splitId={node.id}
        direction={node.direction}
        onResize={context.resizeSplit}
      />
      <div className={DesktopPaneClassName.NodeContent}>
        <DesktopPaneNode context={context} node={node.children[1]} />
      </div>
    </div>
  );
}

export function DesktopPaneTree({
  activeCount,
  availableTypes,
  changePaneType,
  closePane,
  dataSources,
  insertPaneBeside,
  minimizePane,
  resizeSplit,
  root,
  splitPane,
  swapPanes,
}: DesktopPaneTreeProps) {
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<PaneDropZoneValue | null>(null);
  const [splitMenu, setSplitMenu] = useState<SplitMenuState | null>(null);
  const splitMenuRef = useRef<HTMLDivElement>(null);

  const clearDrag = useCallback(() => {
    setDragSourceId(null);
    setDragTargetId(null);
    setDropZone(null);
  }, []);
  const setDragTarget = useCallback(
    (leafId: string | null, zone: PaneDropZoneValue | null) => {
      setDragTargetId(leafId);
      setDropZone(zone);
    },
    [],
  );
  const dropOnPane = useCallback(
    (targetLeafId: string) => {
      if (dragSourceId && dragSourceId !== targetLeafId && dropZone) {
        if (dropZone === PaneDropZone.Center) {
          swapPanes(dragSourceId, targetLeafId);
        } else {
          insertPaneBeside(dragSourceId, targetLeafId, dropZone);
        }
      }
      clearDrag();
    },
    [clearDrag, dragSourceId, dropZone, insertPaneBeside, swapPanes],
  );
  const closeSplitMenu = useCallback(() => setSplitMenu(null), []);
  const openSplitMenu = useCallback(
    (
      leafId: string,
      direction: SplitDirectionValue,
      event: MouseEvent,
    ) => {
      if (availableTypes.length === 1) {
        splitPane(leafId, direction, availableTypes[0]!);
        return;
      }
      const rectangle = event.currentTarget.getBoundingClientRect();
      setSplitMenu((current) =>
        current?.leafId === leafId && current.direction === direction
          ? null
          : {
            direction,
            leafId,
            left:
              rectangle.right - PaneWorkspaceMenuMetric.BoundaryWidth,
            top:
              rectangle.bottom + DesktopPaneMetric.SplitMenuOffsetPx,
          },
      );
    },
    [availableTypes, splitPane],
  );

  useTouchPaneDrag({
    clearDrag,
    dragSourceId,
    dragTargetId,
    dropZone,
    insertPaneBeside,
    setDragTarget,
    swapPanes,
  });
  useSplitMenuDismissal(splitMenu, splitMenuRef, closeSplitMenu);

  const context: DesktopPaneContext = {
    activeCount,
    availableTypes,
    canClose: leafCount(root) > 1,
    changePaneType,
    clearDrag,
    closePane,
    dataSources,
    dragSourceId,
    dragTargetId,
    dropOnPane,
    dropZone,
    insertPaneBeside,
    minimizePane,
    openSplitMenu,
    resizeSplit,
    setDragSourceId,
    setDragTarget,
  };

  return (
    <>
      {splitMenu && (
        <SplitMenu
          ref={splitMenuRef}
          types={availableTypes}
          catalog={PANE_CATALOG}
          top={splitMenu.top}
          left={splitMenu.left}
          onSelect={(paneType) => {
            splitPane(splitMenu.leafId, splitMenu.direction, paneType);
            closeSplitMenu();
          }}
        />
      )}
      <DesktopPaneNode context={context} node={root} />
    </>
  );
}
