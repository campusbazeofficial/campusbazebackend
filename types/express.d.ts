import type { Request } from "express";
import mongoose from "mongoose";
import { IUser } from "../models/user.model.js";

declare global {
  namespace Express {
    interface Request {
      user?: IUser & { _id: mongoose.Types.ObjectId; sessionId: string };  // ← add sessionId
      rawBody?: string;
    }
  }
}

export type AuthRequest = Request & {
  user: IUser & { _id: mongoose.Types.ObjectId; sessionId: string };  // ← add sessionId
};