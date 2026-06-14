import { io, type Socket } from "socket.io-client";
import type { StageEvent } from "@codebrief/shared";

export interface ProgressEmitter {
  emit(event: StageEvent): Promise<void>;
  close(): void;
}

export function createProgressEmitter(socketUrl?: string): ProgressEmitter {
  if (!socketUrl) {
    return {
      async emit(event) {
        process.stdout.write(`[pipeline:${event.analysisId}] ${event.event}\n`);
      },
      close() {},
    };
  }

  const socket: Socket = io(socketUrl, {
    transports: ["websocket"],
    autoConnect: true,
  });

  return {
    async emit(event) {
      socket.emit(event.event, event);
    },
    close() {
      socket.close();
    },
  };
}

