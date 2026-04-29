import mongoose, { Schema, Document } from "mongoose";
import { NOTIFICATION_TYPE, type NotificationType } from "../utils/constant.js";

export interface INotification extends Document {
  _id:    mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type:   NotificationType;
  title:  string;
  body:   string;
  isRead: boolean;
  data?:  Record<string, unknown>;
  slug:      string;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String, enum: Object.values(NOTIFICATION_TYPE), required: true,
    },
    title:  { type: String, required: true, maxlength: 120 },
    body:   { type: String, required: true, maxlength: 500 },
    isRead: { type: Boolean, default: false },
    data:   { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.virtual("slug").get(function () {
  return this.type.toLowerCase().replace(/_/g, "-");
});
notificationSchema.set("toJSON", { virtuals: true });
notificationSchema.set("toObject", { virtuals: true });
const Notification = mongoose.model<INotification>("Notification", notificationSchema);
export default Notification;
