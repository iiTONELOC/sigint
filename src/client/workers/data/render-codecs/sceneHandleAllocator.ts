enum SceneHandleLimit {
  Maximum = 4_294_967_295,
}

export enum SceneHandleErrorKind {
  Exhausted = "The scene handle range is full",
}

export class SceneHandleError extends Error {
  readonly kind: SceneHandleErrorKind;

  constructor(kind: SceneHandleErrorKind) {
    super(kind);
    this.name = SceneHandleError.name;
    this.kind = kind;
  }
}

export class SceneHandleAllocator {
  private readonly handlesBySceneId = new Map<string, number>();
  private readonly reusableHandles: number[] = [];
  private nextHandle = 1;

  acquire(sceneId: string): number {
    const current = this.handlesBySceneId.get(sceneId);
    if (current !== undefined) return current;

    const reusable = this.reusableHandles.pop();
    if (reusable !== undefined) {
      this.handlesBySceneId.set(sceneId, reusable);
      return reusable;
    }
    if (this.nextHandle > SceneHandleLimit.Maximum) {
      throw new SceneHandleError(SceneHandleErrorKind.Exhausted);
    }

    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.handlesBySceneId.set(sceneId, handle);
    return handle;
  }

  release(sceneId: string): number | null {
    const handle = this.handlesBySceneId.get(sceneId);
    if (handle === undefined) return null;
    this.handlesBySceneId.delete(sceneId);
    this.reusableHandles.push(handle);
    return handle;
  }
}
