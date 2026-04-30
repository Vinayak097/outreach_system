import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  ADMIN_PASSWORD: z.string().min(1, "ADMIN_PASSWORD is required"),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 chars"),
  TRACKING_BASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
