import { Router } from 'express'
import {
    postErrand,
    validatePostErrand,
    browseErrands,
    validateBrowseErrands,
    myPostedErrands,
    myRunningErrands,
    myInProgressErrands,
    myAcceptedErrands,
    myAcceptedBids,
    getErrand,
    payForErrand,
    placeBid,
    validatePlaceBid,
    withdrawBid,
    acceptBid,
    startErrand,
    completeErrand,
    validateCompleteErrand,
    proofUpload,
    confirmErrand,
    cancelErrand,
    disputeErrand,
    validateDisputeErrand,
    myBids,
    getErrandMatches,
} from '../controllers/errand.controller.js'
import { ERRAND_PATHS } from '../constants/page-route.js'
import { authenticate } from '../middlewares/auth.js'
import { apiLimiter } from '../middlewares/limiter.js'
import { updateLastSeen } from '../middlewares/updateLastSeen.js'

const router = Router()
// public
router.get(ERRAND_PATHS.LIST, validateBrowseErrands, browseErrands)

router.use(authenticate)
router.use(updateLastSeen)
router.get(ERRAND_PATHS.MY_POSTED, myPostedErrands)
router.get(ERRAND_PATHS.MY_RUNNING, myRunningErrands)
router.get(ERRAND_PATHS.MY_IN_PROGRESS, myInProgressErrands)
router.get(ERRAND_PATHS.MY_ACCEPTED, myAcceptedErrands)
router.get(ERRAND_PATHS.MY_ACCEPTED_BIDS, myAcceptedBids)
router.get(ERRAND_PATHS.MY_BIDS, myBids)
router.post(ERRAND_PATHS.ESCROW_PAY, payForErrand)

router.post(ERRAND_PATHS.LIST, apiLimiter, validatePostErrand, postErrand)
router.get(ERRAND_PATHS.DETAIL, getErrand)
router.post(ERRAND_PATHS.BID, apiLimiter, validatePlaceBid, placeBid)
router.patch(ERRAND_PATHS.ACCEPT_BID, acceptBid)
router.patch(ERRAND_PATHS.WITHDRAW_BID, withdrawBid)
router.get(ERRAND_PATHS.ERRAND_MATCHES, getErrandMatches)
router.patch(ERRAND_PATHS.START, startErrand)
router.patch(
    ERRAND_PATHS.COMPLETE,
    proofUpload,
    validateCompleteErrand,
    completeErrand,
)
router.patch(ERRAND_PATHS.CONFIRM, confirmErrand)
router.patch(ERRAND_PATHS.CANCEL, cancelErrand)
router.patch(ERRAND_PATHS.DISPUTE, validateDisputeErrand, disputeErrand)

export default router
