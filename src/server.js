import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import mongoose from "mongoose";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import crypto from "node:crypto";
import morgan from "morgan";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import categoryRoutes from "./routes/categories.js";
import collectionRoutes from "./routes/collections.js";
import settingsRoutes from "./routes/settings.js";
import pushRoutes from "./routes/push.js";
import notificationRoutes from "./routes/notifications.js";
import auditLogRoutes from "./routes/auditLogs.js";
import usageRoutes from "./routes/usage.js";
import adminRoutes from "./routes/admin.js";
import orderRoutes from "./routes/orders.js";
import bookingRoutes from "./routes/bookings.js";
import returnRoutes from "./routes/returns.js";
import tenantRoutes from "./routes/tenants.js";
import variantRoutes from "./routes/variants.js";
import customerRoutes from "./routes/customers.js";
import supplierRoutes from "./routes/suppliers.js";
import purchaseRoutes from "./routes/purchases.js";
import stockRoutes from "./routes/stock.js";
import reportsRoutes from "./routes/reports.js";
import expenseRoutes from "./routes/expenses.js";
import loyaltyRoutes from "./routes/loyalty.js";
import campaignRoutes from "./routes/campaigns.js";
import billingRoutes from "./routes/billing.js";
import referralRoutes from "./routes/referrals.js";
import staffRoutes from "./routes/staff.js";
import sizeRoutes from "./routes/sizes.js";
import sizeChartRoutes from "./routes/sizeCharts.js";
import superAdminRoutes from "./routes/superAdmin.js";
import { ensureDefaultPlans } from "./utils/seedPlans.js";
import { notFound, errorHandler } from "./middleware/error.js";
import { csrfProtection } from "./middleware/csrf.js";
import { authRateLimit, registerRateLimit } from "./middleware/rateLimits.js";
import { startNotificationWorker } from "./services/notificationWorker.js";
import { auditRequest } from "./middleware/audit.js";
import { startCampaignWorker } from "./services/campaignWorker.js";
import { startBillingWorker, stopBillingWorker } from "./services/billingWorker.js";
import { stopNotificationWorker } from "./services/notificationWorker.js";
import { stopCampaignWorker } from "./services/campaignWorker.js";
import { requestContext } from "./middleware/requestContext.js";
import { responseCompression } from "./middleware/responseCompression.js";
import seoRoutes from "./routes/seo.js";
import securityAuditRoutes from "./routes/securityAudit.js";
import { startBookingWorker } from "./services/bookingService.js";

const app = express();
app.disable("x-powered-by");
app.set("etag", false);

app.set("trust proxy", 1);
app.use(requestContext);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: env.NODE_ENV === "production" ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false
}));
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(responseCompression);
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => crypto.createHash("sha256").update([
    String(ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown")),
    String(req.get("user-agent") || "unknown"),
    String(req.get("host") || "unknown").toLowerCase(),
    String(req.admin?._id || req.body?.email || "anonymous")
  ].join("|")).digest("hex"),
  message: { message: "Too many requests. Please try again later." }
}));
app.use(express.json({ limit: "2mb", strict: true }));
app.use(cookieParser());
app.use(csrfProtection);
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    if (durationMs >= env.LOG_SLOW_REQUEST_MS) {
      console.warn("Slow request:", JSON.stringify({
        requestId: req.requestId, method: req.method, path: req.originalUrl,
        status: res.statusCode, durationMs: Math.round(durationMs * 100) / 100
      }));
    }
  });
  next();
});
app.use(auditRequest);

app.get("/api/health", (req, res) => {
  const db = mongoose.connection.readyState === 1;
  res.status(db ? 200 : 503).json({
    ok: db,
    status: db ? "ready" : "degraded",
    uptime: Math.round(process.uptime()),
    database: db ? "connected" : "disconnected",
    requestId: req.requestId
  });
});
app.get("/api/health/live", (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()), requestId: req.requestId }));
app.get("/api/health/ready", (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ ok: ready, database: ready ? "connected" : "disconnected", requestId: req.requestId });
});
app.use("/api/auth/login", authRateLimit);
app.use("/api/auth/register", registerRateLimit);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/variants", variantRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/sizes", sizeRoutes);
app.use("/api/size-charts", sizeChartRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/collections", collectionRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/security-audit", securityAuditRoutes);
app.use("/seo", seoRoutes);
app.use("/", seoRoutes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    await connectDB();
    await ensureDefaultPlans();
    const server = app.listen(env.PORT, () => {
      console.log(`API listening on ${env.PORT}`);
      startNotificationWorker(env.NOTIFICATION_WORKER_INTERVAL_MS);
      startCampaignWorker(env.NOTIFICATION_WORKER_INTERVAL_MS);
      startBillingWorker(env.BILLING_WORKER_INTERVAL_MS);
      startBookingWorker();
    });
    server.requestTimeout = env.REQUEST_TIMEOUT_MS;
    server.headersTimeout = env.HEADERS_TIMEOUT_MS;
    server.keepAliveTimeout = env.KEEP_ALIVE_TIMEOUT_MS;

    const shutdown = async (signal) => {
      console.log(`${signal} received; starting graceful shutdown.`);
      stopNotificationWorker();
      stopCampaignWorker();
      stopBillingWorker();
      server.close(async () => {
        try {
          await mongoose.disconnect();
          console.log("Graceful shutdown complete.");
          process.exit(0);
        } catch (error) {
          console.error("Shutdown database error:", error.message);
          process.exit(1);
        }
      });
      setTimeout(() => process.exit(1), 15000).unref();
    };
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
}

start();
