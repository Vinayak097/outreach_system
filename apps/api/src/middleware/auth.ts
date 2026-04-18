import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../lib/config.js";

export interface AuthedRequest extends Request {
  userId?: number;
}

export const AUTH_COOKIE = "outreach_session";

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return res.status(401).json({ error: "unauthenticated" });
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as unknown as { sub: number };
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "unauthenticated" });
  }
}

export function issueToken(userId: number): string {
  return jwt.sign({ sub: userId }, config.JWT_SECRET, { expiresIn: "30d" });
}
