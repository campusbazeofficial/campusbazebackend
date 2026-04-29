import { NextFunction } from "express"
import { Request, Response } from "express"
import User from "../models/user.model"

export const updateLastSeen = async (req: Request, res: Response, next: NextFunction) => {
    if (req.user) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

        // Only write to DB if lastSeen is stale — avoids a DB hit on every request
        if (!req.user.lastSeen || req.user.lastSeen < fiveMinutesAgo) {
            await User.updateOne(
                { _id: req.user._id },
                { $set: { lastSeen: new Date() } }
            )
        }
    }
    next()
}