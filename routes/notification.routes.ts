import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { NOTIFICATION_PATHS, SUBSCRIPTION_PATHS } from "../constants/page-route.js";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  getSubscriptionPlans,
  getPublicSubscriptionPlans,
  getMySubscription,
  initializeSubscription, validateSubscribe,
  cancelSubscription,
  upgradeSubscription,
  toggleAutoRenew,
  getNotification,
} from "../controllers/notifications.controller.js";


export const notificationRouter = Router();

notificationRouter.use(authenticate);

notificationRouter.get(   NOTIFICATION_PATHS.LIST,       listNotifications);
notificationRouter.patch( NOTIFICATION_PATHS.MARK_READ,  markNotificationRead);
notificationRouter.patch( NOTIFICATION_PATHS.MARK_ALL,   markAllNotificationsRead);
notificationRouter.delete(NOTIFICATION_PATHS.DELETE_ONE, deleteNotification);
notificationRouter.get("/:slug/:id", authenticate, getNotification);

export const subscriptionRouter = Router();

subscriptionRouter.get(SUBSCRIPTION_PATHS.PUBLIC_PLANS, getPublicSubscriptionPlans)

subscriptionRouter.use(authenticate);
subscriptionRouter.get(SUBSCRIPTION_PATHS.PLANS, getSubscriptionPlans);
subscriptionRouter.get(  SUBSCRIPTION_PATHS.MY,         getMySubscription);
subscriptionRouter.post( SUBSCRIPTION_PATHS.SUBSCRIBE,  validateSubscribe, initializeSubscription);
subscriptionRouter.post( SUBSCRIPTION_PATHS.UPGRADE,    validateSubscribe, upgradeSubscription);
subscriptionRouter.post( SUBSCRIPTION_PATHS.CANCEL,     cancelSubscription);
subscriptionRouter.patch(SUBSCRIPTION_PATHS.AUTO_RENEW, toggleAutoRenew);