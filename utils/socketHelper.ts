import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { registerHandlers } from "../sockets/index.js";

let io: SocketIOServer | null = null;

export const initSocket = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin:      process.env.CLIENT_URL?.split(",") || ["http://localhost:3000"],
      credentials: true,
    },
  });

  registerHandlers(io);

  io.on("connection", (socket: Socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = (): SocketIOServer => {
  if (!io) throw new Error("Socket.io not initialized. Call initSocket() first.");
  return io;
};

export const emitToUser = (
  userId: string,
  event: string,
  data: unknown
): void => {
  getIO().to(`user:${userId}`).emit(event, data);
};

export const emitToRoom = (
  roomId: string,
  event: string,
  data: unknown
): void => {
  getIO().to(roomId).emit(event, data);
};

export const broadcastNotification = (
  userId: string,
  notification: {
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }
): void => {
  emitToUser(userId, "notification:new", notification);
};
