import { Router } from "express";
import { healthQuerySchema } from "../validation/health.js";

export const healthRouter = Router();

healthRouter.get("/health", (req, res) => {
  const parsed = healthQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: "Invalid query", meta: null });
    return;
  }

  res.json({ data: { status: "ok" }, error: null, meta: null });
});
