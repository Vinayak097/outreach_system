import bcrypt from "bcryptjs";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";

export async function bootstrapAdminUser(): Promise<void> {
  const existing = await prisma.user.findFirst();
  if (existing) return;
  const passwordHash = await bcrypt.hash(config.ADMIN_PASSWORD, 10);
  await prisma.user.create({ data: { passwordHash } });
  logger.info("bootstrapped admin user from ADMIN_PASSWORD");
}
