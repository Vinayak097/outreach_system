import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { config } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";
import { AUTH_COOKIE, issueToken, requireAuth } from "../middleware/auth.js";

const router = Router();

const loginSchema = z.object({
  password: z.string().min(1),
});

router.post("/login", async (req, res, next) => {
  try {
    const { password } = loginSchema.parse(req.body);
    const user = await prisma.user.findFirst({ orderBy: { id: "asc" } });
    if (!user) return res.status(500).json({ error: "no_user_bootstrapped" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });
    const token = issueToken(user.id);
    res.cookie(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/me", requireAuth, (_req, res) => {
  res.json({ ok: true });
});

export { router as authRouter };
