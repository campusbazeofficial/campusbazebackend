import mongoose from 'mongoose'
import { BaseService } from './base.service.js'
import Skill, { type ProficiencyLevel } from '../models/skill.model.js'
import User from '../models/user.model.js'
import Errand from '../models/errand.model.js'
import { generateEmbedding, cosineSimilarity } from '../utils/ai.js'
import { NotFoundError, ConflictError } from '../utils/appError.js'

interface AddSkillDto {
    name:        string
    proficiency: ProficiencyLevel
}

// Add this interface at the top of skill.service.ts

export interface MatchedRunner {
    user: {
        _id:                       mongoose.Types.ObjectId
        firstName:                 string
        lastName:                  string
        displayName:               string
        avatar:                    string | null
        bio:                       string | undefined
        averageRating:             number
        identityVerificationBadge: boolean
        isStudent:                 boolean
        role:                      string
    }
    skills: Array<{
        _id:         mongoose.Types.ObjectId
        userId:      mongoose.Types.ObjectId
        name:        string
        proficiency: ProficiencyLevel
        createdAt:   Date
        updatedAt:   Date
    }>
    matchScore: number
}

// Proficiency weight — expert skills count more toward match score
const PROFICIENCY_WEIGHT: Record<ProficiencyLevel, number> = {
    beginner:     0.6,
    intermediate: 0.8,
    expert:       1.0,
}

export class SkillService extends BaseService {

    // ── Add a skill ───────────────────────────────────────────────────────────
    async addSkill(userId: string, dto: AddSkillDto) {
        const existing = await Skill.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            name:   { $regex: `^${dto.name.trim()}$`, $options: 'i' },
        })
        if (existing) throw new ConflictError('You already have this skill')

        // Generate and store embedding immediately
        const embedding = await generateEmbedding(dto.name)

        const skill = await Skill.create({
            userId:      new mongoose.Types.ObjectId(userId),
            name:        dto.name.trim(),
            proficiency: dto.proficiency,
            embedding,
        })

        // Return without embedding
        const { embedding: _, ...rest } = skill.toObject()
        return rest
    }

    // ── Update proficiency (no re-embed needed — name unchanged) ──────────────
    async updateSkill(
        skillId: string,
        userId:  string,
        proficiency: ProficiencyLevel
    ) {
        const skill = await Skill.findOne({
            _id:    new mongoose.Types.ObjectId(skillId),
            userId: new mongoose.Types.ObjectId(userId),
        })
        if (!skill) throw new NotFoundError('Skill')

        skill.proficiency = proficiency
        await skill.save()

        const { embedding: _, ...rest } = skill.toObject()
        return rest
    }

    // ── Remove a skill ────────────────────────────────────────────────────────
    async removeSkill(skillId: string, userId: string): Promise<void> {
        const skill = await Skill.findOneAndDelete({
            _id:    new mongoose.Types.ObjectId(skillId),
            userId: new mongoose.Types.ObjectId(userId),
        })
        if (!skill) throw new NotFoundError('Skill')
    }

    // ── Get my skills ─────────────────────────────────────────────────────────
    async getMySkills(userId: string) {
        return Skill.find({ userId: new mongoose.Types.ObjectId(userId) })
            .select('-embedding')
            .sort({ createdAt: -1 })
            .lean()
    }

    // ── Get any user's skills (public) ────────────────────────────────────────
    async getUserSkills(userId: string) {
        return Skill.find({ userId: new mongoose.Types.ObjectId(userId) })
            .select('-embedding')
            .sort({ proficiency: -1, name: 1 })
            .lean()
    }

    // ── Match runners for an errand ───────────────────────────────────────────
    // Compares errand description + title against each candidate's bio + skills.
    // Scoring: weighted average of bio similarity + best-skill similarity,
    // with proficiency multiplier applied to each skill vector.
    async matchRunnersForErrand(errandId: string, limit = 10): Promise<MatchedRunner[]> {
        const errand = await Errand.findById(errandId).lean()
        if (!errand) throw new NotFoundError('Errand')

        const errandText      = `${errand.title}. ${errand.description}`
        const errandEmbedding = await generateEmbedding(errandText)

        const candidates = await User.find({
            isActive:    true,
            isSuspended: false,
            bio:         { $exists: true, $ne: '' },
            _id:         { $ne: errand.posterId },
        })
            .select('_id firstName lastName displayName avatar bio averageRating identityVerificationBadge isStudent role')
            .lean()

        if (candidates.length === 0) return []

        const candidateIds = candidates.map((c) => c._id)
        const allSkills    = await Skill.find({ userId: { $in: candidateIds } })
            .select('+embedding')
            .lean()

        // Group skills by userId for O(1) lookup
        const skillsByUser = new Map<string, typeof allSkills>()
        for (const skill of allSkills) {
            const uid = skill.userId.toString()
            if (!skillsByUser.has(uid)) skillsByUser.set(uid, [])
            skillsByUser.get(uid)!.push(skill)
        }

        const scored: MatchedRunner[] = await Promise.all(
            candidates.map(async (candidate): Promise<MatchedRunner> => {
                const uid = candidate._id.toString()

                // ── Bio similarity ────────────────────────────────────────────
                let bioScore = 0
                if (candidate.bio) {
                    const bioEmbedding = await generateEmbedding(candidate.bio as string)
                    bioScore = cosineSimilarity(errandEmbedding, bioEmbedding)
                }

                // ── Skill similarity ──────────────────────────────────────────
                const userSkills = skillsByUser.get(uid) ?? []
                let skillScore   = 0

                if (userSkills.length > 0) {
                    const skillScores = userSkills.map((s) => {
                        const sim = cosineSimilarity(errandEmbedding, s.embedding ?? [])
                        return sim * PROFICIENCY_WEIGHT[s.proficiency as ProficiencyLevel]
                    })
                    skillScore = Math.max(...skillScores)
                }

                // ── Combined score ────────────────────────────────────────────
                const finalScore = userSkills.length > 0
                    ? bioScore * 0.4 + skillScore * 0.6
                    : bioScore

                return {
                    user: {
                        _id:                       candidate._id,
                        firstName:                 candidate.firstName,
                        lastName:                  candidate.lastName,
                        displayName:               candidate.displayName,
                        avatar:                    (candidate.avatar as string | undefined) ?? null,
                        bio:                       candidate.bio as string | undefined,
                        averageRating:             candidate.averageRating,
                        identityVerificationBadge: candidate.identityVerificationBadge,
                        isStudent:                 candidate.isStudent,
                        role:                      candidate.role,
                    },
                    skills: userSkills.map(({ embedding: _e, ...s }) => ({
                        _id:         s._id,
                        userId:      s.userId,
                        name:        s.name,
                        proficiency: s.proficiency as ProficiencyLevel,
                        createdAt:   s.createdAt,
                        updatedAt:   s.updatedAt,
                    })),
                    matchScore: parseFloat(finalScore.toFixed(4)),
                }
            })
        )

        return scored
            .filter((s) => s.matchScore > 0)
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, limit)
    }
}