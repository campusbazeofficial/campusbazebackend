import mongoose, { Schema, Document } from "mongoose";

export type PlanType = "individual" | "corporate";

export interface IPlan extends Document {
  tier: string;
  nameLabel: string;
  planType: PlanType;

  monthlyNGN: number;
  yearlyNGN: number;
  studentMonthlyNGN: number;
  studentYearlyNGN: number;

  monthlyCbc: number;
  cbcDiscount: number;
  commissionRate: number;
  studentCommissionRate: number;
  welcomeBonusCbc: number;

  // ── Benefits ─────────────────────────────────────────
  benefits: string[]
  features: {
    profileHighlight:     boolean  // basic+
    priorityListings:     boolean  // pro+
    featuredBadge:        boolean  // pro+
    interviewTools:       boolean  // pro+
    dedicatedSupport:     boolean  // elite+
    contractModule:       boolean  // elite+ / corporate elite
    analyticsDashboard:   boolean  // corporate pro+
    unlimitedJobPosts:    boolean  // corporate elite
    apiAccess:            boolean  // corporate elite (phase 2)
  }

  isActive: boolean;
}

const planSchema = new Schema<IPlan>(
  {
    tier:      { type: String, required: true, unique: true },
    nameLabel: { type: String, required: true },
    planType:  { type: String, enum: ['individual', 'corporate'], required: true, index: true },

    monthlyNGN:        { type: Number, required: true },
    yearlyNGN:         { type: Number, required: true },
    studentMonthlyNGN: { type: Number, default: 0 },
    studentYearlyNGN:  { type: Number, default: 0 },

    monthlyCbc:            { type: Number, default: 0 },
    cbcDiscount:           { type: Number, default: 0 },
    commissionRate:        { type: Number, required: true },
    studentCommissionRate: { type: Number, default: 0 },
    welcomeBonusCbc:       { type: Number, default: 0 },

    // ── Benefits ───────────────────────────────────────
    benefits: { type: [String], default: [] },

    features: {
      profileHighlight:   { type: Boolean, default: false },
      priorityListings:   { type: Boolean, default: false },
      featuredBadge:      { type: Boolean, default: false },
      interviewTools:     { type: Boolean, default: false },
      dedicatedSupport:   { type: Boolean, default: false },
      contractModule:     { type: Boolean, default: false },
      analyticsDashboard:  { type: Boolean, default: false },
      unlimitedJobPosts:  { type: Boolean, default: false },
      apiAccess:          { type: Boolean, default: false },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export default mongoose.model<IPlan>('Plan', planSchema)
