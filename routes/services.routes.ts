import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { apiLimiter } from "../middlewares/limiter.js";
import { SERVICE_PATHS } from "../constants/page-route.js";
import {
  createListing,     validateCreateListing,
  browseListings,
  myListings,
  getListing,
  updateListing,     validateUpdateListing,
  deleteListing,
  placeOrder,        validatePlaceOrder,
  myOrdersBuying,
  myOrdersSelling,
  getOrder,
  deliverOrder,      validateDeliverOrder,
  confirmOrder,
  requestRevision,   validateRevision,
  disputeOrder,      validateDisputeOrder,
  cancelOrder,
  payForOrder,
  cancelOrderAsSeller,
} from "../controllers/services.controller.js";
import { updateLastSeen } from "../middlewares/updateLastSeen.js";

const router = Router();

router.get(SERVICE_PATHS.LIST,   browseListings);
router.get(SERVICE_PATHS.DETAIL, getListing);

router.use(authenticate);
router.use(updateLastSeen)
router.get(SERVICE_PATHS.MY_ORDERS_BUYING,  myOrdersBuying);
router.get(SERVICE_PATHS.MY_ORDERS_SELLING, myOrdersSelling);
router.get(SERVICE_PATHS.ORDER_DETAIL,      getOrder);

router.patch(SERVICE_PATHS.DELIVER,          validateDeliverOrder, deliverOrder);
router.patch(SERVICE_PATHS.CONFIRM_DELIVERY, confirmOrder);
router.post(SERVICE_PATHS.ORDER_ESCROW_PAY, payForOrder)
router.patch(SERVICE_PATHS.REQUEST_REVISION, validateRevision,     requestRevision);
router.patch(SERVICE_PATHS.DISPUTE_ORDER,    validateDisputeOrder, disputeOrder);
router.patch(SERVICE_PATHS.CANCEL_ORDER,     cancelOrder);
router.post(  SERVICE_PATHS.LIST,       apiLimiter, validateCreateListing, createListing);
router.get(   SERVICE_PATHS.MY_LISTINGS, myListings);
router.patch( SERVICE_PATHS.UPDATE,     validateUpdateListing, updateListing);
router.delete(SERVICE_PATHS.DELETE,     deleteListing);
router.patch(SERVICE_PATHS.SELLER_CANCEL_ORDER, cancelOrderAsSeller);
router.post(SERVICE_PATHS.PLACE_ORDER, apiLimiter, validatePlaceOrder, placeOrder);

export default router;
