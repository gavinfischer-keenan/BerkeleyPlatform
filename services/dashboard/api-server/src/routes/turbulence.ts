/**
 * Turbulence Route
 * Fetches AIRMETs and SIGMETs for turbulence from Aviation Weather Center.
 */
import { Router } from "express";
import { withCache } from '../lib/cache.js';
import { apiFetch } from '../lib/fetcher.js';

const router = Router();

router.get("/turbulence", withCache('turbulence'), async (req, res) => {
  try {
    // Fetch FAA/AWC Aviation Weather polygons for SIGMETs and AIRMETs
    const [rAirmet, rSigmet] = await Promise.all([
      apiFetch("https://aviationweather.gov/api/data/airmet?format=geojson").catch(() => null),
      apiFetch("https://aviationweather.gov/api/data/sigmet?format=geojson").catch(() => null)
    ]);

    const turbulence = [];
    const processFeatures = async (r: Response | null) => {
      if (!r || !r.ok) return;
      const json = await r.json() as any;
      if (!json.features) return;
      for (const f of json.features) {
        const hazard = f.properties?.hazard || "";
        if (hazard.includes("TURB") || f.properties?.airmetType?.includes("TANGO")) {
          turbulence.push({
            hazard: f.properties?.hazard || "Turbulence",
            severity: f.properties?.severity || "Mod",
            minAlt: f.properties?.minAlt || f.properties?.base || 0,
            maxAlt: f.properties?.maxAlt || f.properties?.top || 0,
            geometry: f.geometry
          });
        }
      }
    };

    await processFeatures(rAirmet);
    await processFeatures(rSigmet);

    const data = { turbulence, fetchedAt: Date.now() };
    (res as any).cacheStore(data);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch turbulence");
    res.status(502).json({ error: "upstream_unavailable", source: "turbulence" });
  }
});

export default router;
