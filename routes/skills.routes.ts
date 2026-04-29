import { Router } from 'express'
import { authenticate } from '../middlewares/auth.js'
import { SKILL_PATHS } from '../constants/page-route.js'

import {
    addSkill,          validateAddSkill,
    updateSkill,       validateUpdateSkill,
    removeSkill,
    getMySkills,
    getUserSkills,
    // matchRunnersForErrand,
} from '../controllers/skill.controller.js'

const router = Router()

router.use(authenticate)

router.get   (SKILL_PATHS.BASE,         getMySkills)
router.post  (SKILL_PATHS.BASE,         validateAddSkill,    addSkill)
router.patch (SKILL_PATHS.BY_ID,        validateUpdateSkill, updateSkill)
router.delete(SKILL_PATHS.BY_ID,        removeSkill)

router.get   (SKILL_PATHS.USER_SKILLS,  getUserSkills)
// router.get   (SKILL_PATHS.MATCH_ERRAND, matchRunnersForErrand)

export default router