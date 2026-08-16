/**
 * Wind Route
 * Fetches current wind speeds and directions from Open-Meteo for the config-defined wind grid.
 */
import { Router } from "express";
import { getConfig } from '../config.js';
import { withCache } from '../lib/cache.js';
import { apiFetch } from '../lib/fetcher.js';

const router = Router();

// Wind FROM direction → map arrow (arrow points the way the air is going)
function dirToArrow(fromDeg: number): string {
  const toDeg = (fromDeg + 180) % 360;
  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  return arrows[Math.round(toDeg / 45) % 8];
}

router.get("/wind", withCache('wind'), async (req, res) => {
  const cfg = getConfig();
  try {
    const lats = cfg.windGrid.map((p) => p.lat).join(",");
    const lngs = cfg.windGrid.map((p) => p.lon).join(",");
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lats}&longitude=${lngs}` +
      `&current=wind_speed_10m,wind_direction_10m` +
      `&wind_speed_unit=kn&timezone=${encodeURIComponent(cfg.location.timezone)}`;

    const r = await apiFetch(url);
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);

    const json = (await r.json()) as Array<{
      latitude: number;
      longitude: number;
      current: { wind_speed_10m: number; wind_direction_10m: number };
    }>;

    const arr = Array.isArray(json) ? json : [json];
    const points = arr.map((loc, i) => ({
      name:      `Grid ${loc.latitude.toFixed(1)}, ${loc.longitude.toFixed(1)}`,
      lat:       loc.latitude,
      lng:       loc.longitude,
      speedKt:   Math.round(loc.current.wind_speed_10m),
      direction: Math.round(loc.current.wind_direction_10m),
      arrow:     dirToArrow(loc.current.wind_direction_10m),
    }));

    const data = { points, fetchedAt: Date.now(), source: "open-meteo" };
    (res as any).cacheStore(data);
    res.json(data);
  } catch (err) {
    req.log.warn({ err }, "Wind fetch failed");
    res.status(502).json({ error: "upstream_unavailable", source: "wind" });
  }
});

export default router;

