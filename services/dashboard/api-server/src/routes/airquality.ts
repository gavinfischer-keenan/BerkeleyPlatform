/**
 * Air Quality Route
 * Fetches current AQI and pollutant concentrations from Open-Meteo for config-defined locations.
 */
import { Router } from "express";
import { getConfig } from '../config.js';
import { withCache } from '../lib/cache.js';
import { apiFetch } from '../lib/fetcher.js';

const router = Router();

interface OMCurrent {
  time: string;
  us_aqi: number;
  pm2_5: number;
  pm10: number;
  ozone: number;
}
interface OMResult {
  latitude: number;
  longitude: number;
  current: OMCurrent;
}

function dominantPol(c: OMCurrent): string {
  // Normalise each pollutant to a rough share of its US AQI breakpoint band
  // so the larger contributor wins. Approximate — for display only.
  const scaled: Record<string, number> = {
    pm25: c.pm2_5 / 35,
    pm10: c.pm10 / 150,
    o3: c.ozone / 160,
  };
  return Object.entries(scaled).sort((a, b) => b[1] - a[1])[0][0];
}

// Bay Area monitoring points. Open-Meteo Air Quality API is keyless,
// global, and returns the US AQI plus pollutant concentrations per lat/lng.
router.get("/airquality", withCache('airquality'), async (req, res) => {
  const cfg = getConfig();
  try {
    const lats = cfg.airQualityPoints.map((p) => p.lat).join(",");
    const lngs = cfg.airQualityPoints.map((p) => p.lon).join(",");
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}` +
      `&longitude=${lngs}&current=us_aqi,pm2_5,pm10,ozone&timezone=${encodeURIComponent(cfg.location.timezone)}`;

    const r = await apiFetch(url);
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);

    const json = await r.json();
    // Open-Meteo returns an array when multiple coordinates are requested,
    // or a single object for one coordinate.
    const arr: OMResult[] = Array.isArray(json) ? json : [json];

    const sensors = arr.map((d, i) => {
      const c = d.current;
      return {
        name: cfg.airQualityPoints[i]?.name ?? `Point ${i + 1}`,
        lat: cfg.airQualityPoints[i]?.lat ?? d.latitude,
        lng: cfg.airQualityPoints[i]?.lon ?? d.longitude,
        aqi: Math.round(c.us_aqi),
        pm25: c.pm2_5,
        pm10: c.pm10,
        o3: c.ozone,
        dominentpol: dominantPol(c),
        updatedAt: c.time,
      };
    });

    const data = { sensors, fetchedAt: Date.now() };
    (res as any).cacheStore(data);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch air quality");
    res.status(502).json({ error: "upstream_unavailable", source: "airquality" });
  }
});

export default router;
