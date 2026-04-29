import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { WALLET_PATHS } from "../constants/page-route.js";
import {
  getBalance,
  getTransactions,
  initializePurchase,    validateInitPurchase,
  verifyPurchase,        validateVerifyPurchase,
  getBanks,
  requestWithdrawal,  validateWithdrawal,
  getWithdrawalHistory,
} from "../controllers/wallets.controller.js";
import { updateLastSeen } from "../middlewares/updateLastSeen.js";

const router = Router();

router.use(authenticate);
router.use(updateLastSeen)
// ─── Balance & ledger ─────────────────────────────────────────────────────────
router.get(WALLET_PATHS.BALANCE,      getBalance);
router.get(WALLET_PATHS.TRANSACTIONS, getTransactions);

// ─── CBC purchase (Paystack) ──────────────────────────────────────────────────
router.post(WALLET_PATHS.PURCHASE_INITIALIZE, validateInitPurchase,   initializePurchase);
router.get( WALLET_PATHS.PURCHASE_VERIFY,     validateVerifyPurchase, verifyPurchase);

// ─── NGN withdrawal ───────────────────────────────────────────────────────────
router.post(WALLET_PATHS.WITHDRAWAL_INITIALIZE, validateWithdrawal, requestWithdrawal);
router.get( WALLET_PATHS.WITHDRAWAL_HISTORY,    getWithdrawalHistory);

// ─── Helpers ──────────────────────────────────────────────────────────────────
router.get(WALLET_PATHS.BANKS, getBanks);

export default router;