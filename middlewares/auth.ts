import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../utils/jwt.js'
import User from '../models/user.model.js'
import { UnauthorizedError, ForbiddenError } from '../utils/appError.js'
import type { UserRole } from '../types/index.js'
import Session from '../models/session.model.js'

export const authenticate = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
            throw new UnauthorizedError('No token provided')
        }

        const token = authHeader.slice(7)
        const payload = verifyAccessToken(token)

        // ✅ check session is still valid
        const session = await Session.findById(payload.sessionId)
        if (!session) {
            throw new UnauthorizedError('Session not found')
        }

        if (session.isRevoked) {
            throw new UnauthorizedError('Session revoked')
        }

        if (session.expiresAt < new Date()) {
            throw new UnauthorizedError('Session expired')
        }

        const user = await User.findById(payload.userId)
        if (!user || !user.isActive)
            throw new UnauthorizedError('User not found or inactive')
        if (user.isSuspended)
            throw new ForbiddenError(
                `Account suspended: ${user.suspendedReason || 'contact support'}`,
            )

        req.user = user as unknown as typeof req.user
        req.user!.sessionId = payload.sessionId
        next()
    } catch (err) {
        next(err)
    }
}

export const authorize =
    (...roles: UserRole[]) =>
    (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.user) return next(new UnauthorizedError())
        if (!roles.includes(req.user.role as UserRole)) {
            return next(
                new ForbiddenError(
                    'You do not have permission to perform this action',
                ),
            )
        }
        next()
    }
