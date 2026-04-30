import { Router } from "express";
import { config } from "../lib/config.js";
import { tick } from "../services/scheduler.js";

export const cronRouter = Router();

cronRouter.post("/tick", async (req, res) => {
  const authHeader = req.headers["authorization"];
  if (authHeader !== `Bearer ${config.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const result = await tick(new Date());
  res.json({ ok: true, ...result });
});
