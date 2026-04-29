import mongoose, { Schema, Document } from "mongoose";

export type DeliveryStatus = "sent" | "delivered" | "read";

export interface IMessage extends Document {
  _id:              mongoose.Types.ObjectId;
  roomId:           string;                    // "order:<id>" | "errand:<id>"
  roomType:         "order" | "errand";
  senderId:         mongoose.Types.ObjectId;
  content:          string;
  attachmentUrl?:   string;
  attachmentPublicId?: string;

  // Delivery
  deliveryStatus:   DeliveryStatus;           // sent → delivered → read
  deliveredAt?:     Date;
  readAt?:          Date;

  // Reply thread
  replyToId?:       mongoose.Types.ObjectId;  // parent message _id

  // Edit / soft-delete
  isEdited:         boolean;
  editedAt?:        Date;
  isDeleted:        boolean;                  // soft delete — content replaced
  deletedAt?:       Date;

  createdAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    roomId:   { type: String, required: true },
    roomType: { type: String, enum: ["order", "errand"], required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content:  { type: String, required: true, maxlength: 4000 },
    attachmentUrl:       { type: String },
    attachmentPublicId:  { type: String },

    deliveryStatus: {
      type:    String,
      enum:    ["sent", "delivered", "read"],
      default: "sent",
    },
    deliveredAt: { type: Date },
    readAt:      { type: Date },

    replyToId: { type: Schema.Types.ObjectId, ref: "Message" },

    isEdited:  { type: Boolean, default: false },
    editedAt:  { type: Date },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

messageSchema.index({ roomId: 1, _id: -1 });    // cursor pagination
messageSchema.index({ roomId: 1, deliveryStatus: 1, senderId: 1 }); // unread counts
messageSchema.index({ senderId: 1 });

const Message = mongoose.model<IMessage>("Message", messageSchema);
export default Message;