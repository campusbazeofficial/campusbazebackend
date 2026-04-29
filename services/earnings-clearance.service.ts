import mongoose from 'mongoose'
import EarningsClearance, { CLEARANCE_STATUS } from '../models/earnin.js'
import { CbcService } from './cbc.service.js'
import { NotFoundError } from '../utils/appError.js'
import { emitToUser } from '../utils/socketHelper.js'

const cbcService = new CbcService()

export class EarningsClearanceService {
    async approveClearance(clearanceId: string, adminId: string) {
        return this.clear(clearanceId, adminId)
    }

    async clear(clearanceId: string, actor: string) {
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            const clearance = await EarningsClearance.findOneAndUpdate(
                { _id: clearanceId, status: CLEARANCE_STATUS.PENDING },
                { status: CLEARANCE_STATUS.PROCESSING },
                { new: true, session },
            )

            if (!clearance) {
                throw new NotFoundError(
                    'Clearance not found or already processed',
                )
            }

            await cbcService.releaseHeldEarnings(
                clearance.userId.toString(),
                clearance.amountNGN,
                clearance._id.toString(),
            )

            clearance.status = CLEARANCE_STATUS.APPROVED
            clearance.reviewedBy = new mongoose.Types.ObjectId(actor)
            clearance.reviewedAt = new Date()

            await clearance.save({ session })
            emitToUser(clearance.userId.toString(), 'clearance:updated', {
                id: clearance._id.toString(),
                status: CLEARANCE_STATUS.APPROVED,
                amountNGN: clearance.amountNGN,
            })
            await session.commitTransaction()
            return clearance
        } catch (err) {
            await session.abortTransaction()
            throw err
        } finally {
            session.endSession()
        }
    }
    async rejectClearance(
        clearanceId: string,
        adminId: string,
        reason: string,
    ) {
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            const clearance = await EarningsClearance.findOneAndUpdate(
                { _id: clearanceId, status: CLEARANCE_STATUS.PENDING },
                { status: CLEARANCE_STATUS.PROCESSING },
                { new: true, session },
            )

            if (!clearance) {
                throw new NotFoundError(
                    'Clearance not found or already processed',
                )
            }

            // 🔴 reverse held funds
            await cbcService.reverseHeldEarnings(
                clearance.userId.toString(),
                clearance.amountNGN,
                clearance._id.toString(),
                reason,
            )

            clearance.status = CLEARANCE_STATUS.REJECTED
            clearance.reviewedBy = new mongoose.Types.ObjectId(adminId)
            clearance.reviewedAt = new Date()
            clearance.adminNote = reason

            await clearance.save({ session })

            await session.commitTransaction()
            return clearance
        } catch (err) {
            await session.abortTransaction()
            throw err
        } finally {
            session.endSession()
        }
    }
}
