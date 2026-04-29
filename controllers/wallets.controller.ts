import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { CbcService } from "../services/cbc.service.js";
import { WithdrawalService } from "../services/withdraw.service.js";
import { validate } from "../middlewares/validate.js";
import { sendSuccess, sendCreated } from "../utils/response.js";
import { parsePaginationQuery } from "../utils/paginate.js";
import {
  initializeTransaction,
  verifyTransaction,
  listBanks,
  generateReference,
} from "../utils/paystack.js";
import { BadRequestError } from "../utils/appError.js";

const cbcService        = new CbcService();
const CBC_RATE_NGN = Number(process.env.CBC_RATE_NGN) || 10;

const withdrawalService = new WithdrawalService();

export const withdrawalSchema = z.object({
  amountNGN:     z.number().positive().min(500, "Minimum withdrawal is ₦500"),
  bankCode:      z.string().min(1, "Bank code is required"),
  accountNumber: z.string().length(10, "Account number must be 10 digits"),
  accountName:   z.string().min(2, "Account name is required"),
  bankName:      z.string().min(1, "Bank name is required"),
});


export const initPurchaseSchema = z.object({
  cbcAmount: z.number().int().positive().min(10, "Minimum purchase is 10 CBC"),
  callbackUrl: z.string().url().optional(),
});
export const verifyPurchaseSchema = z.object({
  reference: z.string().min(1),
});
export const validateWithdrawal = validate(withdrawalSchema);
export const validateInitPurchase  = validate(initPurchaseSchema);
export const validateVerifyPurchase = validate(verifyPurchaseSchema, "query");

// export const getBalance = async (
//   req: Request, res: Response, next: NextFunction
// ): Promise<void> => {
//   try {
//     const userId  = req.user!._id.toString();
//     const wallet  = await cbcService.getWallet(userId);
//     sendSuccess(res, {
//       cbcBalance:    wallet?.balance     ?? 0,
//       ngnEarnings:   wallet?.ngnEarnings ?? 0,
//     });
//   } catch (err) { next(err); }
// };

export const getBalance = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!._id.toString();
    const wallet = await cbcService.getWallet(userId);
    sendSuccess(res, {
      cbcBalance:      wallet?.balance         ?? 0,
      ngnEarnings:     wallet?.ngnEarnings     ?? 0,
      pendingEarnings: wallet?.pendingEarnings ?? 0,  // ← add this
    });
  } catch (err) { next(err); }
};

export const getTransactions = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const opts   = parsePaginationQuery(req.query as Record<string, string>);
    const result = await cbcService.getLedger(req.user!._id.toString(), opts);
    res.json({ success: true, data: result.data, meta: result.meta });
  } catch (err) { next(err); }
};

export const initializePurchase = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const userId    = req.user!._id;
    const userEmail = req.user!.email;
    const { cbcAmount, callbackUrl } = req.body as { cbcAmount: number; callbackUrl?: string };

    const amountNGN  = cbcAmount * CBC_RATE_NGN;
    const reference  = generateReference("CBC");

    const paystack = await initializeTransaction(
      userEmail,
      amountNGN,
      reference,
      {
        userId,
        type:      "cbc_purchase",
        cbcAmount,
      },
      callbackUrl
    );

    sendCreated(res, {
      ...paystack,
      amountNGN,
      cbcAmount,
      rateNGNperCBC: CBC_RATE_NGN,
    });
  } catch (err) { next(err); }
};

export const verifyPurchase = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const { reference } = req.query as { reference: string };
    const tx = await verifyTransaction(reference);

    if (tx.status !== "success") {
      res.status(400).json({
        success: false,
        data: { message: `Payment ${tx.status}`, reference },
      });
      return;
    }

    const cbcAmount = tx.metadata?.cbcAmount as number | undefined;
    const userId    = tx.metadata?.userId    as string | undefined;

    // Guard: only credit if this was for the authenticated user
    if (userId !== req.user!._id.toString()) {
      throw new BadRequestError("Transaction does not belong to this account");
    }

    sendSuccess(res, {
      message:   "Payment verified. CBC will be credited shortly.",
      reference: tx.reference,
      amountNGN: tx.amountNGN,
      cbcAmount,
      status:    tx.status,
    });
  } catch (err) { next(err); }
};

export const requestWithdrawal = async (

  req: Request, res: Response, next: NextFunction

): Promise<void> => {

  try {

    const { amountNGN, bankCode, accountNumber, accountName, bankName } =

      req.body as z.infer<typeof withdrawalSchema>;

    const result = await withdrawalService.requestWithdrawal(

      req.user!._id.toString(),

      amountNGN,

      bankCode,

      bankName,        // ← note: bankName before accountNumber in requestWithdrawal

      accountNumber,

      accountName,

    );

    sendCreated(res, result);

  } catch (err) { next(err); }

};

export const cancelWithdrawal = async (

  req: Request, res: Response, next: NextFunction

): Promise<void> => {

  try {

    const result = await withdrawalService.cancelWithdrawal(

      req.params.withdrawalId as string,

      req.user!._id.toString(),

    );

    sendSuccess(res, { message: 'Withdrawal cancelled and earnings refunded', withdrawal: result });

  } catch (err) { next(err); }

};

export const getBanks = async (
  _req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const banks = await listBanks();
    sendSuccess(res, { banks });
  } catch (err) { next(err); }
};

// export const initializeWithdrawal = async (
//   req: Request, res: Response, next: NextFunction
// ): Promise<void> => {
//   try {
//     const { amountNGN, bankCode, accountNumber, accountName, bankName } =
//       req.body as z.infer<typeof withdrawalSchema>;

//     const result = await withdrawalService.initializeWithdrawal(
//       req.user!._id.toString(),
//       amountNGN,
//       bankCode,
//       accountNumber,
//       accountName,
//       bankName
//     );

//     sendCreated(res, result);
//   } catch (err) { next(err); }
// };

export const getWithdrawalHistory = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const withdrawals = await withdrawalService.getWithdrawals(
      req.user!._id.toString()
    );
    sendSuccess(res, { withdrawals });
  } catch (err) { next(err); }
};