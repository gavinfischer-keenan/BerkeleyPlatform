/**
 * Currents Route
 * Fetches ocean surface currents from the Open-Meteo Marine model for config-defined points.
 */
import { Router } from "express";
import { getConfig } from '../config.js';
import { withCache } from '../lib/cache.js';
import { apiFetch } from '../lib/fetcher.js';

const router = Router();

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
// ocean_current_direction = the compass heading the current flows TOWARD.
function arrowFor(dirDeg: number): string {
  return ARROWS[Math.round(((dirDeg % 360) / 45)) % 8];
}

type MarineCurrent = {
  current?: {
    ocean_current_velocity?: number; // km/h
    ocean_current_direction?: number; // deg (toward)
    sea_level_height_msl?: number; // m
  };
};

async function fetchPoint(p: { name: string; lat: number; lon: number }) {
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${p.lat}&longitude=${p.lon}` +
    `&current=ocean_current_velocity,ocean_current_direction,sea_level_height_msl&timezone=auto`;
  const r = await apiFetch(url);
  if (!r.ok) throw new Error(`Open-Meteo marine ${r.status}`);
  const j = (await r.json()) as MarineCurrent;
  const c = j.current ?? {};
  const kmh = c.ocean_current_velocity ?? null;
  const dir = c.ocean_current_direction ?? null;
  const kt = kmh != null ? Math.round(kmh * 0.539957 * 10) / 10 : null;
  return {
    name: p.name,
    lat: p.lat,
    lng: p.lon,
    speedKt: kt,
    dirDeg: dir,
    arrow: dir != null ? arrowFor(dir) : "·",
    seaLevelM: c.sea_level_height_msl ?? null,
  };
}

// Ocean surface currents from the Open-Meteo Marine model (keyless, global).
// Returns model-derived current speed + direction at a spread of offshore
// points around the Bay Area. Cached server-side because
// the marine model only updates a few times per day.
router.get("/currents", withCache('currents'), async (req, res) => {
  const cfg = getConfig();
  try {
    const results = await Promise.allSettled(cfg.currentPoints.map(fetchPoint));
    const points = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchPoint>>> => r.status === "fulfilled")
      .map((r) => r.value);

    const withSpeed = points.filter((p) => p.speedKt != null);
    const avgKt = withSpeed.length
      ? Math.round((withSpeed.reduce((s, p) => s + (p.speedKt as number), 0) / withSpeed.length) * 10) / 10
      : null;

    const data = { points, avgKt, source: "Open-Meteo Marine model", fetchedAt: Date.now() };
    (res as any).cacheStore(data);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch ocean currents");
    res.status(502).json({ error: "upstream_unavailable", source: "currents" });
  }
});

export default router;

