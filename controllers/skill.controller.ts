import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { SkillService } from '../services/skill.service.js'
import { validate } from '../middlewares/validate.js'
import { sendSuccess, sendCreated } from '../utils/response.js'
import { PROFICIENCY_LEVEL } from '../models/skill.model.js'

const skillService = new SkillService()

// ─── Schemas ──────────────────────────────────────────────────────────────────

const addSkillSchema = z.object({
    name:        z.string().min(1).max(80).trim(),
    proficiency: z.enum(Object.values(PROFICIENCY_LEVEL) as [string, ...string[]]),
})

const updateSkillSchema = z.object({
    proficiency: z.enum(Object.values(PROFICIENCY_LEVEL) as [string, ...string[]]),
})

export const validateAddSkill    = validate(addSkillSchema)
export const validateUpdateSkill = validate(updateSkillSchema)

// ─── Handlers ─────────────────────────────────────────────────────────────────

export const addSkill = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const skill = await skillService.addSkill(req.user!._id.toString(), req.body)
        sendCreated(res, { skill })
    } catch (err) { next(err) }
}

export const updateSkill = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const skill = await skillService.updateSkill(
            req.params.skillId as string,
            req.user!._id.toString(),
            req.body.proficiency
        )
        sendSuccess(res, { skill })
    } catch (err) { next(err) }
}

export const removeSkill = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await skillService.removeSkill(req.params.skillId as string, req.user!._id.toString())
        sendSuccess(res, { message: 'Skill removed' })
    } catch (err) { next(err) }
}

export const getMySkills = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const skills = await skillService.getMySkills(req.user!._id.toString())
        sendSuccess(res, { skills })
    } catch (err) { next(err) }
}

export const getUserSkills = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const skills = await skillService.getUserSkills(req.params.userId as string)
        sendSuccess(res, { skills })
    } catch (err) { next(err) }
}

// export const matchRunnersForErrand = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
//     try {
//         const limit   = req.query.limit ? Number(req.query.limit) : 10
//         const matches = await skillService.matchRunnersForErrand(req.params.errandId as string, limit)
//         sendSuccess(res, { matches, total: matches.length })
//     } catch (err) { next(err) }
// }