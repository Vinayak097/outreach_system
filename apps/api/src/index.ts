import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { bootstrapAdminUser } from "./services/bootstrap.js";

async function main() {
  await bootstrapAdminUser();

  const app = express();
  app.use(
    cors({
      origin: config.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);

  app.use(errorHandler);

  app.listen(config.PORT, () => {
    logger.info("api listening", { port: config.PORT, frontend: config.FRONTEND_URL });
  });
}

main().catch((err) => {
  logger.error("startup failed", { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
