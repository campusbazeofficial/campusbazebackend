import mongoose, { Schema, Document } from "mongoose";

export interface IReview extends Document {
  _id:        mongoose.Types.ObjectId;
  reviewerId: mongoose.Types.ObjectId;
  revieweeId: mongoose.Types.ObjectId;
  refId:      mongoose.Types.ObjectId;   // orderId or errandId
  refType:    "order" | "errand";
  rating:     number;                    // 1–5
  comment?:   string;
  isVerified: boolean;                   // review from verified buyer carries extra weight
  createdAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    reviewerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    revieweeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    refId:      { type: Schema.Types.ObjectId, required: true },
    refType:    { type: String, enum: ["order", "errand"], required: true },
    rating:     { type: Number, required: true, min: 1, max: 5 },
    comment:    { type: String, maxlength: 1500 },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

// One review per reviewer per ref
reviewSchema.index({ reviewerId: 1, refId: 1 }, { unique: true });
reviewSchema.index({ revieweeId: 1, createdAt: -1 });

const Review = mongoose.model<IReview>("Review", reviewSchema);
export default Review;
