import { createServer } from "node:http";
import { Server } from "socket.io";

const port = Number.parseInt(process.env.SOCKET_IO_PORT || "4001", 10);
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  socket.on("join", ({ analysisId }: { analysisId?: string }) => {
    if (analysisId) socket.join(`analysis:${analysisId}`);
  });

  for (const eventName of ["stage_start", "stage_progress", "stage_complete", "stage_failed", "analysis_complete", "analysis_failed"]) {
    socket.on(eventName, (event: { analysisId?: string }) => {
      if (event.analysisId) io.to(`analysis:${event.analysisId}`).emit(eventName, event);
    });
  }
});

httpServer.listen(port, () => {
  process.stdout.write(`Codebrief Socket.io server listening on ${port}\n`);
});

