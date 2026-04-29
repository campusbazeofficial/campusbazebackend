import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ChatService } from "../services/chat.service.js";
import { validate } from "../middlewares/validate.js";
import { sendSuccess, sendCreated } from "../utils/response.js";

const chatService = new ChatService();

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const sendMessageSchema = z.object({
  content:   z.string().min(1, "Message cannot be empty").max(4000),
  replyToId: z.string().optional(),
});

export const validateSendMessage = validate(sendMessageSchema);

/**
 * GET /api/v1/chat/rooms
 * List all chat rooms the authenticated user participates in.
 * Returns rooms sorted by last activity with unread count per room.
 */
export const listRooms = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const rooms = await chatService.getRooms(req.user!._id.toString());
    sendSuccess(res, { rooms });
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/chat/:roomId/messages
 * Load message history for a room (REST fallback for initial page load).
 *
 * Query params:
 *   before  — message ObjectId cursor (omit for first page)
 *   limit   — max messages to return (default 30, max 50)
 *
 * Returns messages in chronological order (oldest → newest).
 * Use `nextCursor` from the response as `before` in the next request.
 * `hasMore: false` means you have reached the beginning of the conversation.
 */
export const getMessages = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const roomId = req.params.roomId;
    const before = req.query.before as string | undefined;
    const limit  = Number(req.query.limit) || 30;

    const result = await chatService.getMessages(
      roomId as string,
      req.user!._id.toString(),
      before,
      limit
    );

    sendSuccess(res, result);
  } catch (err) { next(err); }
};

/**
 * POST /api/v1/chat/:roomId/messages
 * Send a message via REST — use this when a persistent socket connection
 * is not available (mobile background, unstable network, etc.).
 *
 * If the recipient is online the message is pushed to their socket in real
 * time. If offline, an in-app push notification is sent instead.
 *
 * Body: { content: string, replyToId?: string }
 */
export const sendMessage = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const { content, replyToId } = req.body as { content: string; replyToId?: string };
    const message = await chatService.sendMessage(
      req.params.roomId as string,
      req.user!._id.toString(),
      content,
      replyToId
    );
    sendCreated(res, { message });
  } catch (err) { next(err); }
};

export const markAsRead = async (
    req: Request, res: Response, next: NextFunction
): Promise<void> => {
    try {
        await chatService.markAsRead(
            req.params.roomId as string,
            req.user!._id.toString(),
        )
        sendSuccess(res)
    } catch (err) { next(err) }
}