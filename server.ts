import "dotenv/config";
import http from "http";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import corsOptions from "./configs/cors.js";
import connectToMongoDB from "./configs/db.js";
import { requestLogger } from "./middlewares/logger.js";
import { apiLimiter } from "./middlewares/limiter.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { initSocket } from "./utils/socketHelper.js";
import { setupSwagger } from "./swagger/swagger.js";

import authRoutes         from "./routes/auth.routes.js";
import userRoutes         from "./routes/user.routes.js";
import walletRoutes       from "./routes/wallet.routes.js";
import verificationRoutes from "./routes/verification.routes.js";
import adminRoutes        from "./routes/admin.routes.js";
 import  errandRoutes      from "./routes/errand.routes.js";
 import chatRoutes      from "./routes/chat.routes.js";
import serviceRoutes from "./routes/services.routes.js";;
import webhookRoutes      from "./routes/webhook.routes.js";
import reviewRoutes      from "./routes/review.routes.js";
import skillRoutes      from "./routes/skills.routes.js";
import supportRoutes      from "./routes/support.routes.js";
import { notificationRouter, subscriptionRouter } from "./routes/notification.routes.js";

import { startSubscriptionCron } from "./cron/sub.cron.js";
import { startWithdrawalCron } from "./cron/withdrawal.cron.js";
import { startClearanceCron } from "./cron/clearance.cron.js";
import { startMonthlyCbcCron } from "./cron/monthlycbc.cron.js";

const app        = express();
const httpServer = http.createServer(app);

initSocket(httpServer);

app.use(helmet());
app.use(corsOptions);
app.use(cookieParser());
app.use(requestLogger);

app.use(
  "/api/v1/webhooks",
  express.raw({ type: "*/*", limit: "1mb" }),
  webhookRoutes
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.set('trust proxy', 1)
app.use("/api", apiLimiter);

app.use("/api/v1/auth",          authRoutes);
app.use("/api/v1/users",         userRoutes);
app.use("/api/v1/wallet",        walletRoutes);
app.use("/api/v1/verifications", verificationRoutes);
app.use("/api/v1/admin",         adminRoutes);
app.use("/api/v1/errands", errandRoutes);
app.use("/api/v1/services", serviceRoutes);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/subscriptions", subscriptionRouter);
app.use("/api/v1/chat",          chatRoutes);
app.use("/api/v1/reviews",       reviewRoutes);
app.use("/api/v1/skills",       skillRoutes);
app.use("/api/v1/support",       supportRoutes);
// app.use("api/v1/plans", planRoutes)
app.get("/health", (_req, res) => {
  res.json({
    status:    "ok",
    service:   "CampusBaze API",
    version:   "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

setupSwagger(app);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    data:    { message: "Route not found" },
  });
});

app.use(errorHandler);

const PORT      = Number(process.env.PORT)      || 4000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not set in .env");
  process.exit(1);
}

connectToMongoDB(MONGO_URI).then(() => {
  httpServer.listen(PORT, () => {
    startSubscriptionCron();
    startWithdrawalCron()
    startClearanceCron()
    startMonthlyCbcCron()
    const env = process.env.NODE_ENV ?? "development";
    console.log(`🚀 CampusBaze API running on port ${PORT} [${env}]`);
  });
});

export default app;