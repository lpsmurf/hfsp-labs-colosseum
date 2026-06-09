import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ ok: true, data: { status: "healthy" }, expiresAt: null });
});

export default router;
