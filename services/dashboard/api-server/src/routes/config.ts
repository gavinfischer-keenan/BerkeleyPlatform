/**
 * /api/config — Serves the frontend-safe subset of the dashboard configuration.
 *
 * The frontend fetches this once on boot to populate the CONFIG global.
 * This endpoint strips server-only settings (cache durations, fetch timeouts)
 * and returns everything the frontend needs: location, stations, coordinates,
 * UI settings, colors, etc.
 */
import { Router } from 'express';
import { getClientConfig } from '../config.js';

const router = Router();

router.get('/config', (_req, res) => {
  res.json(getClientConfig());
});

export default router;
