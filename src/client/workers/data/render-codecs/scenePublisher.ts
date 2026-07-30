import {
  createSceneDataCommand,
  SceneDataCommandType,
  sceneDataTransfers,
  type SceneDataCommand,
  type SceneDataCommandBody,
  type SceneSourcePatch,
} from "@/workers/render/sceneProtocol";

export type SceneMessagePort = Readonly<{
  postMessage: (
    message: SceneDataCommand,
    transfer: Transferable[],
  ) => void;
}>;

export class ScenePublisher {
  private port: SceneMessagePort | null = null;
  private sequence = 0;
  private sessionId: string | null = null;

  connect(port: SceneMessagePort, sessionId: string): void {
    this.port = port;
    this.sessionId = sessionId;
    this.sequence = 0;
    this.post({ type: SceneDataCommandType.Bind });
  }

  publish(patch: SceneSourcePatch): boolean {
    if (!this.port || !this.sessionId) return false;
    this.post(patch);
    return true;
  }

  disconnect(): void {
    this.port = null;
    this.sessionId = null;
    this.sequence = 0;
  }

  private post(body: SceneDataCommandBody): void {
    if (!this.port || !this.sessionId) return;
    this.sequence += 1;
    const command = createSceneDataCommand(
      body,
      this.sessionId,
      this.sequence,
    );
    this.port.postMessage(
      command,
      Array.from(sceneDataTransfers(command)),
    );
  }
}
