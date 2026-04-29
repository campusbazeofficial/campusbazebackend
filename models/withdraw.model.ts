import mongoose, { Schema, Document } from "mongoose";
import { MIN_WITHDRAWAL_NGN } from "../utils/constant";

export const WITHDRAWAL_STATUS = {
    PENDING:    'pending',     // requested, in 24hr hold
    PROCESSING: 'processing',  // hold passed, transfer initiated
    PAID:       'paid',        // transfer.success confirmed
    FAILED:     'failed',      // transfer.failed — balance refunded
    CANCELLED:  'cancelled',   // cancelled during hold period
} as const

export type WithdrawalStatus =
  (typeof WITHDRAWAL_STATUS)[keyof typeof WITHDRAWAL_STATUS];

export interface IWithdrawal extends Document {
  _id:             mongoose.Types.ObjectId;
  userId:          mongoose.Types.ObjectId;

  // Bank details
  bankCode:        string;
  bankName:        string;
  accountNumber:   string;
  accountName:     string;   // verified name from Paystack

  // Amount
  amountNGN:       number;

  // Paystack
  recipientCode:   string;    // Paystack transfer recipient code
  transferCode?:   string;    // Paystack transfer code (set after initiate)
  reference:       string;    // our reference

  status:          WithdrawalStatus;
  failureReason?:  string;

  initiatedAt:     Date;
  completedAt?:    Date;
releaseAt:     Date
requestedAt:   Date
  createdAt: Date;
  updatedAt: Date;
}

const withdrawalSchema = new Schema<IWithdrawal>(
  {
    userId:        { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    bankCode:      { type: String, required: true },
    bankName:      { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountName:   { type: String, required: true },
    amountNGN:     { type: Number, required: true, min: MIN_WITHDRAWAL_NGN },
    recipientCode: { type: String, required: true },
    transferCode:  { type: String },
    reference:     { type: String, required: true, },
    status:        {
      type: String,
      enum: Object.values(WITHDRAWAL_STATUS),
      default: WITHDRAWAL_STATUS.PENDING,
      index: true,
    },
releaseAt:     { type: Date, required: true },   // now + 24hrs — when transfer can fire
requestedAt:   { type: Date, default: () => new Date() },
    failureReason: { type: String },
    initiatedAt:   { type: Date, default: () => new Date() },
    completedAt:   { type: Date },
  },
  { timestamps: true }
);

withdrawalSchema.index({ reference: 1 }, { unique: true });

const Withdrawal = mongoose.model<IWithdrawal>("Withdrawal", withdrawalSchema);
export default Withdrawal;