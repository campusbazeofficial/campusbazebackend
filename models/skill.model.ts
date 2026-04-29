import mongoose, { Schema, Document } from 'mongoose'

export const PROFICIENCY_LEVEL = {
    BEGINNER:     'beginner',
    INTERMEDIATE: 'intermediate',
    EXPERT:       'expert',
} as const

export type ProficiencyLevel = typeof PROFICIENCY_LEVEL[keyof typeof PROFICIENCY_LEVEL]

export interface ISkill extends Document {
    _id:         mongoose.Types.ObjectId
    userId:      mongoose.Types.ObjectId
    name:        string
    proficiency: ProficiencyLevel
    embedding:   number[]   // stored vector — recomputed only when name changes
    createdAt:   Date
    updatedAt:   Date
}

const skillSchema = new Schema<ISkill>(
    {
        userId:      { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name:        { type: String, required: true, trim: true, maxlength: 80 },
        proficiency: { type: String, enum: Object.values(PROFICIENCY_LEVEL), required: true },
        embedding:   { type: [Number], select: false }, // never sent to client
    },
    { timestamps: true }
)

skillSchema.index({ userId: 1, name: 1 }, { unique: true }) // no duplicate skills per user

const Skill = mongoose.model<ISkill>('Skill', skillSchema)
export default Skill