import type { Request, Response } from 'express'
import { WithdrawalService } from '../services/withdraw.service.js'

const withdrawalService = new WithdrawalService()

export const requestWithdrawal = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id
        const { amountNGN, bankCode, bankName, accountNumber, accountName } = req.body

        const withdrawal = await withdrawalService.requestWithdrawal(
            userId,
            amountNGN,
            bankCode,
            bankName,
            accountNumber,
            accountName,
        )

        res.status(201).json({ success: true, data: withdrawal })
    } catch (err) {
        res.status(500).json({ success: false, data: { message: err instanceof Error ? err.message : 'Something went wrong' } })
    }
}

export const adminProcessWithdrawal = async (req: Request, res: Response) => {
    try {
        const { withdrawalId } = req.params
        const withdrawal = await withdrawalService.adminProcessWithdrawal(withdrawalId as string)
        res.status(200).json({ success: true, data: withdrawal })
    } catch (err) {
        res.status(500).json({ success: false, data: { message: err instanceof Error ? err.message : 'Something went wrong' } })
    }
}

export const adminListWithdrawals = async (req: Request, res: Response) => {
    try {
        const { status } = req.query
        const withdrawals = await withdrawalService.adminListWithdrawals(status as string)
        res.status(200).json({ success: true, data: withdrawals })
    } catch (err) {
        res.status(500).json({ success: false, data: { message: err instanceof Error ? err.message : 'Something went wrong' } })
    }
}

export const cancelWithdrawal = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id
        const { withdrawalId } = req.params

        const withdrawal = await withdrawalService.cancelWithdrawal(withdrawalId as string, userId)
        res.status(200).json({ success: true, data: withdrawal })
    } catch (err) {
        res.status(500).json({ success: false, data: { message: err instanceof Error ? err.message : 'Something went wrong' } })
    }
}

export const getWithdrawals = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id
        const withdrawals = await withdrawalService.getWithdrawals(userId)
        res.status(200).json({ success: true, data: withdrawals })
    } catch (err) {
        res.status(500).json({ success: false, data: { message: err instanceof Error ? err.message : 'Something went wrong' } })
    }
}