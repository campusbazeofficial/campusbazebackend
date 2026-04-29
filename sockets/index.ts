import type { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import { registerChatHandlers, type AuthSocket } from "./handlers/notificationHandler.js";

export const registerHandlers = (io: SocketIOServer): void => {

  // ── Authentication middleware ──────────────────────────────────────────────
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.query?.token as string | undefined);

    if (!token) return next(new Error("Authentication required"));

    const secret = process.env.JWT_SECRET;
    if (!secret) return next(new Error("Server configuration error"));

    try {
      const payload = jwt.verify(token, secret) as { userId: string };
      (socket as AuthSocket).userId = payload.userId;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const authSocket = socket as AuthSocket;
    const { userId } = authSocket;

    // Join personal notification room — used by notificationService.create()
    socket.join(`user:${userId}`);

    // Register chat handlers (async — auto-join rooms, deliver pending, etc.)
    registerChatHandlers(io, authSocket).catch((err) => {
      console.error(`[Socket] Error setting up handlers for ${userId}:`, err);
    });
  });
};
