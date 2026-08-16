/**
 * Earthquakes Route
 * Fetches recent earthquakes from USGS near the config center coordinates.
 */
import { Router } from "express";
import { getConfig } from '../config.js';
import { withCache } from '../lib/cache.js';
import { apiFetch } from '../lib/fetcher.js';

const router = Router();

// USGS Earthquake API — free, no key required
// Returns recent quakes within ~300km of the center
router.get("/earthquakes", withCache('earthquakes'), async (req, res) => {
  const cfg = getConfig();
  const [lat, lng] = cfg.location.center;

  try {
    const url = new URL("https://earthquake.usgs.gov/fdsnws/event/1/query");
    url.searchParams.set("format", "geojson");
    url.searchParams.set("latitude", lat.toString());
    url.searchParams.set("longitude", lng.toString());
    url.searchParams.set("maxradiuskm", "300");
    url.searchParams.set("minmagnitude", "1.0");
    url.searchParams.set("limit", "20");
    url.searchParams.set("orderby", "time");

    const response = await apiFetch(url.toString());

    if (!response.ok) {
      throw new Error(`USGS responded ${response.status}`);
    }

    const raw = (await response.json()) as {
      features: Array<{
        id: string;
        geometry: { coordinates: [number, number, number] };
        properties: {
          mag: number;
          place: string;
          time: number;
          type: string;
        };
      }>;
    };

    const quakes = raw.features.map((f) => ({
      id: f.id,
      mag: f.properties.mag,
      place: f.properties.place,
      time: f.properties.time,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      depth: f.geometry.coordinates[2],
    }));

    const data = { quakes, fetchedAt: Date.now() };
    (res as any).cacheStore(data);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch earthquakes");
    res.status(502).json({ error: "upstream_unavailable", source: "earthquakes" });
  }
});

export default router;
