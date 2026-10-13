import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { collectLeafTypes, type LayoutNode } from "@/panes/paneTree";
import type { PaneTypeValue } from "@/panes/workspace/model/pane";
import {
  PANE_CATALOG,
  type PaneDefinition,
} from "@/panes/workspace/paneCatalog";

enum PaneBodyClassName {
  Host = "w-full h-full relative overflow-hidden",
  Slot = "w-full h-full",
}

type PaneBodyContextValue = Readonly<{
  adopt: (paneType: PaneTypeValue, slot: HTMLElement) => void;
  release: (paneType: PaneTypeValue) => void;
}>;

const PaneBodyContext = createContext<PaneBodyContextValue | null>(null);

type PaneBodyLayerProps = Readonly<{
  children: ReactNode;
  root: LayoutNode;
}>;

export function PaneBodyLayer({ children, root }: PaneBodyLayerProps) {
  const parkRef = useRef<HTMLDivElement | null>(null);
  const hostsRef = useRef(new Map<PaneTypeValue, HTMLDivElement>());

  const persistentTypes = useMemo(
    () =>
      [...collectLeafTypes(root)].filter(
        (paneType) => PANE_CATALOG[paneType].persistent === true,
      ),
    [root],
  );

  const hostFor = (paneType: PaneTypeValue): HTMLDivElement => {
    const existing = hostsRef.current.get(paneType);
    if (existing) return existing;
    const host = document.createElement("div");
    host.className = PaneBodyClassName.Host;
    hostsRef.current.set(paneType, host);
    return host;
  };

  const value = useMemo<PaneBodyContextValue>(
    () => ({
      adopt: (paneType, slot) => {
        const host = hostsRef.current.get(paneType);
        if (host) slot.append(host);
      },
      release: (paneType) => {
        const host = hostsRef.current.get(paneType);
        const park = parkRef.current;
        if (host && park) park.append(host);
      },
    }),
    [],
  );

  return (
    <PaneBodyContext.Provider value={value}>
      {children}
      <div hidden ref={parkRef} />
      {persistentTypes.map((paneType) => {
        const Body = PANE_CATALOG[paneType].component;
        return createPortal(<Body />, hostFor(paneType), paneType);
      })}
    </PaneBodyContext.Provider>
  );
}

export function usePaneBodiesActive(): boolean {
  return useContext(PaneBodyContext) !== null;
}

type PaneBodyProps = Readonly<{
  definition: PaneDefinition;
  paneType: PaneTypeValue;
}>;

export function PaneBody({ definition, paneType }: PaneBodyProps) {
  const bodies = useContext(PaneBodyContext);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const persistent = definition.persistent === true && bodies !== null;

  useLayoutEffect(() => {
    if (!persistent || !bodies) return undefined;
    const slot = slotRef.current;
    if (slot) bodies.adopt(paneType, slot);
    return () => bodies.release(paneType);
  }, [bodies, paneType, persistent]);

  if (!persistent) {
    const Body = definition.component;
    return <Body />;
  }
  return <div className={PaneBodyClassName.Slot} ref={slotRef} />;
}
