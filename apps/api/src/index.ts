import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { campaignFlowRouter } from "./routes/campaignFlow.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { cronRouter } from "./routes/cron.js";
import { leadsRouter } from "./routes/leads.js";
import { smtpRouter } from "./routes/smtp.js";
import { templatesRouter } from "./routes/templates.js";
import { trackingRouter } from "./routes/tracking.js";
import { bootstrapAdminUser } from "./services/bootstrap.js";
import { startImapPoller } from "./services/imapPoller.js";
import { startScheduler } from "./services/scheduler.js";

export const app = express();

app.use(cors({ origin: config.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/smtp", smtpRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/campaigns", campaignFlowRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/cron", cronRouter);
app.use("/t", trackingRouter);

app.use(errorHandler);

bootstrapAdminUser()
  .then(() => {
    app.listen(config.PORT, () => {
      logger.info("api listening", { port: config.PORT, frontend: config.FRONTEND_URL });
      startScheduler();
      startImapPoller();
    });
  })
  .catch((err) => {
    logger.error("startup failed", { message: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
