import { useSyncExternalStore } from "react";
import type { PaneTypeValue } from "@/panes/workspace";
import { WalkthroughLaunchMode, WalkthroughStepId } from "../model/vocabulary";

type Listener = () => void;
type ChannelListener<Arguments extends readonly unknown[]> = (
  ...args: Arguments
) => void;

function createExternalStore<Value>(initialValue: Value) {
  let value = initialValue;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set: (next: Value) => {
      if (Object.is(value, next)) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function createEventChannel<Arguments extends readonly unknown[]>() {
  const listeners = new Set<ChannelListener<Arguments>>();
  return {
    emit: (...args: Arguments) => {
      listeners.forEach((listener) => listener(...args));
    },
    subscribe: (listener: ChannelListener<Arguments>) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

type WalkthroughLayoutSnapshot = Readonly<{
  leafCount: number;
  leafTypes: ReadonlySet<PaneTypeValue>;
  presetCount: number;
}>;

const resetChannel = createEventChannel<readonly []>();
const undoChannel = createEventChannel<readonly [PaneTypeValue]>();
const launchChannel = createEventChannel<readonly [WalkthroughLaunchMode]>();
const layoutStore = createExternalStore<WalkthroughLayoutSnapshot>({
  leafCount: 0,
  leafTypes: new Set<PaneTypeValue>(),
  presetCount: 0,
});
const activeStore = createExternalStore(false);
const stepStore = createExternalStore<WalkthroughStepId | null>(null);
const videoPresetCountStore = createExternalStore(0);

export function requestWalkthroughReset(): void {
  resetChannel.emit();
}

export function onWalkthroughReset(listener: () => void): () => void {
  return resetChannel.subscribe(listener);
}

export function requestWalkthroughUndo(paneType: PaneTypeValue): void {
  undoChannel.emit(paneType);
}

export function onWalkthroughUndo(
  listener: (paneType: PaneTypeValue) => void,
): () => void {
  return undoChannel.subscribe(listener);
}

export function setWalkthroughLayoutSnapshot(
  leafTypes: ReadonlySet<PaneTypeValue>,
  leafCount: number,
  presetCount: number,
): void {
  layoutStore.set({ leafTypes, leafCount, presetCount });
}

export function useWalkthroughLeafTypes(): ReadonlySet<PaneTypeValue> {
  return useSyncExternalStore(
    layoutStore.subscribe,
    () => layoutStore.get().leafTypes,
    () => layoutStore.get().leafTypes,
  );
}

export function useWalkthroughLeafCount(): number {
  return useSyncExternalStore(
    layoutStore.subscribe,
    () => layoutStore.get().leafCount,
    () => layoutStore.get().leafCount,
  );
}

export function useWalkthroughPresetCount(): number {
  return useSyncExternalStore(
    layoutStore.subscribe,
    () => layoutStore.get().presetCount,
    () => layoutStore.get().presetCount,
  );
}

export function setWalkthroughActive(value: boolean): void {
  activeStore.set(value);
}

export function useWalkthroughActive(): boolean {
  return useSyncExternalStore(
    activeStore.subscribe,
    activeStore.get,
    activeStore.get,
  );
}

export function setWalkthroughStepId(
  stepId: WalkthroughStepId | null,
): void {
  stepStore.set(stepId);
}

export function useWalkthroughStepId(): WalkthroughStepId | null {
  return useSyncExternalStore(
    stepStore.subscribe,
    stepStore.get,
    stepStore.get,
  );
}

export function setVideoPresetCount(count: number): void {
  videoPresetCountStore.set(count);
}

export function useVideoPresetCount(): number {
  return useSyncExternalStore(
    videoPresetCountStore.subscribe,
    videoPresetCountStore.get,
    videoPresetCountStore.get,
  );
}

export function requestWalkthroughLaunch(mode: WalkthroughLaunchMode): void {
  launchChannel.emit(mode);
}

export function onWalkthroughLaunch(
  listener: (mode: WalkthroughLaunchMode) => void,
): () => void {
  return launchChannel.subscribe(listener);
}
