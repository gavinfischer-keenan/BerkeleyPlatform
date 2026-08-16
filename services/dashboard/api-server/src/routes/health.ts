/**
 * Health Check Route
 * Returns a simple JSON status for uptime monitoring and load balancer probes.
 */
import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
