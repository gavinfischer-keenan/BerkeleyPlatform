/**
 * Ships Route
 * Returns recent vessel observations from the database.
 * (Will be populated by MQTT in the future).
 */
import { Router } from "express";
import { getAllVessels } from "../db";

const router = Router();

router.get("/ships", (_req, res) => {
  const vessels = getAllVessels();
  
  // Return recent vessels (seen in last 24h)
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const ships = vessels.filter(v => v.last_seen > cutoff);

  res.json({ ships, connected: false, fetchedAt: Date.now() });
});

export default router;
