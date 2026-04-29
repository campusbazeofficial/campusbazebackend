import mongoose, { Schema, Document } from "mongoose";

export interface ISession extends Document {
  userId: mongoose.Types.ObjectId;
  refreshToken: string;
  deviceInfo?: string;
  ipAddress?: string;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    userId:       { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    refreshToken: { type: String, required: true, unique: true, index: true },
    deviceInfo:   { type: String },
    ipAddress:    { type: String },
    isRevoked:    { type: Boolean, default: false, index: true },
    expiresAt:    { type: Date, required: true },
  },
  { timestamps: true }
);

// Auto-remove expired sessions
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = mongoose.model<ISession>("Session", sessionSchema);
export default Session;

export function find(arg0: { userId: mongoose.Types.ObjectId; isRevoked: boolean; expiresAt: { $gt: Date; }; }) {
  throw new Error("Function not implemented.");
}
