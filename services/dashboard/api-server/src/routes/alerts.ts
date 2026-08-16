/**
 * Alerts Route
 * Fetches active NWS alerts for the config-defined area and zones.
 */
import { Router } from "express";
import { getConfig } from '../config.js';
import { withCache } from '../lib/cache.js';
import { apiFetch } from '../lib/fetcher.js';

const router = Router();

router.get("/alerts", withCache('alerts'), async (req, res) => {
  const cfg = getConfig();
  try {
    const area = cfg.alerts.area;
    const zones = cfg.alerts.zones;

    const fetches = [
      apiFetch(`https://api.weather.gov/alerts/active?area=${encodeURIComponent(area)}`)
    ];

    for (const zone of zones) {
      fetches.push(apiFetch(`https://api.weather.gov/alerts/active?zone=${encodeURIComponent(zone)}`));
    }

    const responses = await Promise.all(fetches);

    for (const r of responses) {
      if (!r.ok) throw new Error(`NWS alerts returned ${r.status}`);
    }

    const jsons = await Promise.all(responses.map(r => r.json() as Promise<{ features: any[] }>));
    
    let allFeatures: any[] = [];
    for (const j of jsons) {
      allFeatures = allFeatures.concat(j.features || []);
    }

    // De-duplicate features by ID to avoid overlapping alerts from area + zone overlap
    const seen = new Set();
    const uniqueFeatures = allFeatures.filter(f => {
      const id = f.properties.id || f.id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const alerts = uniqueFeatures.map((f: any) => ({
      event: f.properties.event,
      severity: f.properties.severity,
      headline: f.properties.headline,
      description: f.properties.description,
      areaDesc: f.properties.areaDesc,
      effective: f.properties.effective,
      expires: f.properties.expires,
      geometry: (f as any).geometry,
    }));

    const data = { alerts, fetchedAt: Date.now() };
    (res as any).cacheStore(data);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch NWS alerts");
    res.status(502).json({ error: "upstream_unavailable", source: "alerts" });
  }
});

export default router;
