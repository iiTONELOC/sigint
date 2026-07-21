import {
  createSceneDataCommand,
  sceneDataTransfers,
  type SceneDataCommand,
  type SceneSourcePatch,
} from "@/workers/render/sceneProtocol";

export type SceneMessagePort = Readonly<{
  postMessage: (
    message: SceneDataCommand,
    transfer: Transferable[],
  ) => void;
}>;

export type ScenePublisher = Readonly<{
  connect: (port: SceneMessagePort, sessionId: string) => void;
  publish: (patch: SceneSourcePatch) => boolean;
  disconnect: () => void;
}>;

export function createScenePublisher(): ScenePublisher {
  let port: SceneMessagePort | null = null;
  let sessionId: string | null = null;
  let sequence = 0;

  const post = (
    body: Parameters<typeof createSceneDataCommand>[0],
  ): void => {
    if (!port || !sessionId) return;
    sequence += 1;
    const command = createSceneDataCommand(
      body,
      sessionId,
      sequence,
    );
    port.postMessage(command, Array.from(sceneDataTransfers(command)));
  };

  return {
    connect(nextPort, nextSessionId): void {
      port = nextPort;
      sessionId = nextSessionId;
      sequence = 0;
      post({ type: "bind" });
    },

    publish(patch): boolean {
      if (!port || !sessionId) return false;
      post(patch);
      return true;
    },

    disconnect(): void {
      port = null;
      sessionId = null;
      sequence = 0;
    },
  };
}
