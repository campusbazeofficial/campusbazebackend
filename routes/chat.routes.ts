import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { CHAT_PATHS } from "../constants/page-route.js";
import {
  listRooms,
  getMessages,
  sendMessage, validateSendMessage,
  markAsRead,
} from "../controllers/chat.controller.js";

const router = Router();

router.use(authenticate);

router.get( CHAT_PATHS.ROOMS,    listRooms);
router.get( CHAT_PATHS.MESSAGES, getMessages);
router.post(CHAT_PATHS.MESSAGES, validateSendMessage, sendMessage);
router.put( CHAT_PATHS.READ,     markAsRead);
export default router;