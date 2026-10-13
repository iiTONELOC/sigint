import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useReducer,
} from "react";
import { DomEvent } from "@/runtime";

export function useDrag() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragged, setDragged] = useState(false);
  const dragState = useRef({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });
  const posRef = useRef(pos);
  posRef.current = pos;

  // Window-level move/up so touch drag works reliably
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragState.current.active) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      setPos({
        x: dragState.current.origX + dx,
        y: dragState.current.origY + dy,
      });
      setDragged(true);
    };
    const onUp = () => {
      dragState.current.active = false;
    };
    window.addEventListener(`${DomEvent.PointerMove}`, onMove);
    window.addEventListener(`${DomEvent.PointerUp}`, onUp);
    window.addEventListener(`${DomEvent.PointerCancel}`, onUp);
    return () => {
      window.removeEventListener(`${DomEvent.PointerMove}`, onMove);
      window.removeEventListener(`${DomEvent.PointerUp}`, onUp);
      window.removeEventListener(`${DomEvent.PointerCancel}`, onUp);
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: posRef.current.x,
      origY: posRef.current.y,
    };
  }, []);

  const reset = useCallback(() => {
    setPos({ x: 0, y: 0 });
    setDragged(false);
  }, []);

  return { pos, dragged, onPointerDown, reset };
}


enum SheetSnapHeightVh {
  Peek = 18,
  Half = 38,
  Full = 55,
}

export enum SheetPolicy {
  VhPerViewport = 100,
  OverDragVh = 2,
  MinDragHeightVh = 10,
  DismissHeightVh = 12,
  SnapSeekMarginVh = 5,
  DismissDragFactor = 0.5,
  DismissOffsetPx = 400,
  FlickDismissVelocity = 1.2,
  FlickExpandVelocity = -0.8,
  AnimationMs = 200,
  SnapSettleMs = 250,
}


const SHEET_SNAP_HEIGHTS = Object.values(SheetSnapHeightVh).filter(
  (height): height is SheetSnapHeightVh => typeof height === "number",
);

export function useSheetDismiss(onClose: () => void) {
  const offsetRef = useRef(0);
  const settlingRef = useRef(false);
  const [heightVh, setHeightVh] = useState<number>(SheetSnapHeightVh.Half);
  const heightRef = useRef<number>(SheetSnapHeightVh.Half);
  heightRef.current = heightVh;
  const heightAtDragStart = useRef<number>(SheetSnapHeightVh.Half);
  const [, forceRender] = useReducer((count: number) => count + 1, 0);
  const dragRef = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    lastT: 0,
    velocity: 0,
  });
  const sheetRef = useRef<HTMLDivElement>(null);

  const update = useCallback((offset: number, settling: boolean) => {
    offsetRef.current = offset;
    settlingRef.current = settling;
    forceRender();
  }, []);

  const snapTo = useCallback((vh: number) => {
    settlingRef.current = true;
    setHeightVh(vh);
    if (offsetRef.current !== 0) offsetRef.current = 0;
    forceRender();
    setTimeout(() => {
      settlingRef.current = false;
      forceRender();
    }, SheetPolicy.SnapSettleMs);
  }, []);

  const reset = useCallback(() => {
    dragRef.current = {
      active: false,
      startY: 0,
      lastY: 0,
      lastT: 0,
      velocity: 0,
    };
    if (heightRef.current !== SheetSnapHeightVh.Half) {
      setHeightVh(SheetSnapHeightVh.Half);
    }
    if (offsetRef.current !== 0 || settlingRef.current) {
      offsetRef.current = 0;
      settlingRef.current = false;
      forceRender();
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const sheet = sheetRef.current;
    if (sheet && sheet.scrollTop > 0) return;
    const touch = e.touches[0];
    if (!touch) return;
    heightAtDragStart.current = heightRef.current;
    dragRef.current = {
      active: true,
      startY: touch.clientY,
      lastY: touch.clientY,
      lastT: Date.now(),
      velocity: 0,
    };
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!dragRef.current.active) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dy = touch.clientY - dragRef.current.startY;
      const now = Date.now();
      const dt = now - dragRef.current.lastT;
      if (dt > 0) {
        dragRef.current.velocity = (touch.clientY - dragRef.current.lastY) / dt;
      }
      dragRef.current.lastY = touch.clientY;
      dragRef.current.lastT = now;
      const dvh = (dy / window.innerHeight) * SheetPolicy.VhPerViewport;
      const newH = Math.max(
        SheetPolicy.MinDragHeightVh,
        Math.min(
          SheetSnapHeightVh.Full + SheetPolicy.OverDragVh,
          heightAtDragStart.current - dvh,
        ),
      );
      setHeightVh(newH);
      if (newH <= SheetPolicy.MinDragHeightVh) {
        update(
          Math.max(
            0,
            dy -
              (heightAtDragStart.current / SheetPolicy.VhPerViewport) *
                window.innerHeight *
                SheetPolicy.DismissDragFactor,
          ),
          false,
        );
      } else if (offsetRef.current !== 0) {
        update(0, false);
      }
    },
    [update],
  );

  const onTouchEnd = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const vel = dragRef.current.velocity;
    const h = heightRef.current;

    if (vel > SheetPolicy.FlickDismissVelocity) {
      update(SheetPolicy.DismissOffsetPx, true);
      setTimeout(onClose, SheetPolicy.AnimationMs);
      return;
    }
    if (vel < SheetPolicy.FlickExpandVelocity) {
      const next =
        SHEET_SNAP_HEIGHTS.find(
          (snap) => snap > h + SheetPolicy.SnapSeekMarginVh,
        ) ?? SheetSnapHeightVh.Full;
      snapTo(next);
      return;
    }
    if (h < SheetPolicy.DismissHeightVh) {
      update(SheetPolicy.DismissOffsetPx, true);
      setTimeout(onClose, SheetPolicy.AnimationMs);
      return;
    }

    let best = SheetSnapHeightVh.Peek;
    let bestDist = Infinity;
    for (const snap of SHEET_SNAP_HEIGHTS) {
      const distance = Math.abs(snap - h);
      if (distance < bestDist) {
        bestDist = distance;
        best = snap;
      }
    }
    snapTo(best);
  }, [onClose, update, snapTo]);

  return {
    sheetRef,
    heightVh,
    get offsetY() {
      return offsetRef.current;
    },
    get settling() {
      return settlingRef.current;
    },
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    reset,
  };
}
