import type {
  RenderSearchSnapshot,
  RenderSelectionSnapshot,
} from "@/workers/render/protocol";
import {
  createSceneCommand,
  SceneInterestCommandType,
  type SceneInterestCommand,
  type SceneInterestCommandBody,
} from "@/workers/render/sceneProtocol";

enum SceneInterestSequence {
  Initial = 0,
  Increment = 1,
}

export type SceneInterestPort = Readonly<{
  postMessage: (message: SceneInterestCommand) => void;
}>;

export class SceneInterestPublisher {
  private port: SceneInterestPort | null = null;
  private sequence = SceneInterestSequence.Initial;
  private sessionId: string | null = null;

  connect(port: SceneInterestPort, sessionId: string): void {
    this.port = port;
    this.sessionId = sessionId;
    this.sequence = SceneInterestSequence.Initial;
  }

  publishSelection(selection: RenderSelectionSnapshot): boolean {
    return this.publish({
      type: SceneInterestCommandType.Selection,
      selection,
    });
  }

  publishSearch(search: RenderSearchSnapshot): boolean {
    return this.publish({
      type: SceneInterestCommandType.Search,
      search,
    });
  }

  private publish(body: SceneInterestCommandBody): boolean {
    if (!this.port || !this.sessionId) return false;
    this.sequence += SceneInterestSequence.Increment;
    this.port.postMessage(
      createSceneCommand(
        body,
        this.sessionId,
        this.sequence,
      ),
    );
    return true;
  }

  disconnect(): void {
    this.port = null;
    this.sessionId = null;
    this.sequence = SceneInterestSequence.Initial;
  }
}
