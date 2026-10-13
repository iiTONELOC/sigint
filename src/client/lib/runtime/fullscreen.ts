import {
  type RefObject,
  useCallback,
  useEffect,
  useState,
} from "react";
import { DomEvent } from "@/runtime";

export function useBrowserFullscreen(
  elementRef: RefObject<HTMLDivElement | null>,
) {
  const [active, setActive] = useState(false);
  const synchronize = useCallback(() => {
    setActive(document.fullscreenElement === elementRef.current);
  }, [elementRef]);
  const toggle = useCallback(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }
    const operation = document.fullscreenElement === element
      ? document.exitFullscreen()
      : element.requestFullscreen();
    void operation.catch(synchronize);
  }, [elementRef, synchronize]);

  useEffect(() => {
    document.addEventListener(DomEvent.FullscreenChange, synchronize);
    synchronize();
    return () =>
      document.removeEventListener(DomEvent.FullscreenChange, synchronize);
  }, [synchronize]);

  return { active, toggle: document.fullscreenEnabled ? toggle : undefined };
}
