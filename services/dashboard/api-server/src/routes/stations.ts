/**
 * Stations Route
 * Fetches recent METAR observations for config-defined weather stations from the NWS API.
 */
import { Router } from "express";
import { getConfig } from '../config.js';
import { withCache } from '../lib/cache.js';
import { apiFetch } from '../lib/fetcher.js';

const router = Router();

type ObsProps = {
  temperature?: { value: number | null };
  windSpeed?: { value: number | null };
  windDirection?: { value: number | null };
  textDescription?: string | null;
  timestamp?: string;
};

function degToCompass(deg: number | null): string | null {
  if (deg == null) return null;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

// Land weather stations we pull temperature/wind from, shown live on the map.
// Observations come from the National Weather Service (free, no key). Each
// station's latest METAR-derived observation is fetched and normalized.
router.get("/stations", withCache('stations'), async (req, res) => {
  const cfg = getConfig();
  try {
    const results = await Promise.all(
      cfg.weatherStations.map(async (s) => {
        try {
          // The /observations/latest record alternates between real METARs and
          // null placeholders (QC flag "Z"), so pull the recent list and pick
          // the newest entry that actually has a temperature.
          const r = await apiFetch(`https://api.weather.gov/stations/${s.id}/observations?limit=8`);
          if (!r.ok) throw new Error(`NWS ${s.id} ${r.status}`);
          const json = (await r.json()) as { features: Array<{ properties: ObsProps }> };
          const feats = json.features ?? [];
          const p: ObsProps =
            feats.find((f) => f.properties.temperature?.value != null)?.properties ??
            feats[0]?.properties ??
            {};
          const tempC = p.temperature?.value ?? null;
          const windKmh = p.windSpeed?.value ?? null;
          return {
            ...s,
            tempF: tempC != null ? Math.round((tempC * 9) / 5 + 32) : null,
            windKt: windKmh != null ? Math.round(windKmh * 0.539957) : null,
            windDir: degToCompass(p.windDirection?.value ?? null),
            windDeg: p.windDirection?.value ?? null,
            conditions: p.textDescription ?? null,
            obsTime: p.timestamp ?? null,
          };
        } catch {
          return { ...s, tempF: null, windKt: null, windDir: null, conditions: null, obsTime: null };
        }
      }),
    );

    const data = { stations: results, fetchedAt: Date.now() };
    (res as any).cacheStore(data);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch weather stations");
    res.status(502).json({ error: "upstream_unavailable", source: "stations" });
  }
});

export default router;

