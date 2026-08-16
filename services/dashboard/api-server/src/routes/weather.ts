/**
 * Weather Route
 * Fetches current weather and hourly forecast from the NWS API using the config center coordinates.
 */
import { Router } from "express";
import { getConfig } from '../config.js';
import { withCache } from '../lib/cache.js';
import { apiFetch } from '../lib/fetcher.js';

const router = Router();

// National Weather Service API — free, no key required
router.get("/weather", withCache('weather'), async (req, res) => {
  const cfg = getConfig();
  const [lat, lng] = cfg.location.center;

  try {
    // Step 1: get the forecast office + grid for this location
    const pointRes = await apiFetch(`https://api.weather.gov/points/${lat},${lng}`);
    if (!pointRes.ok) throw new Error(`NWS points ${pointRes.status}`);

    const pointJson = (await pointRes.json()) as {
      properties: {
        forecast: string;
        forecastHourly: string;
        relativeLocation: { properties: { city: string; state: string } };
      };
    };

    // Step 2: get the actual forecast
    const forecastRes = await apiFetch(pointJson.properties.forecastHourly);
    if (!forecastRes.ok) throw new Error(`NWS forecast ${forecastRes.status}`);

    const forecastJson = (await forecastRes.json()) as {
      properties: {
        periods: Array<{
          number: number;
          startTime: string;
          temperature: number;
          temperatureUnit: string;
          windSpeed: string;
          windDirection: string;
          shortForecast: string;
          relativeHumidity?: { value: number };
          probabilityOfPrecipitation?: { value: number };
        }>;
      };
    };

    const now = forecastJson.properties.periods[0];
    const next6 = forecastJson.properties.periods.slice(0, 6);

    const data = {
      location: pointJson.properties.relativeLocation.properties.city,
      tempF: now.temperature,
      tempUnit: now.temperatureUnit,
      windSpeed: now.windSpeed,
      windDirection: now.windDirection,
      shortForecast: now.shortForecast,
      humidity: now.relativeHumidity?.value ?? null,
      precipChance: now.probabilityOfPrecipitation?.value ?? null,
      hourly: next6.map((p) => ({
        time: p.startTime,
        tempF: p.temperature,
        wind: `${p.windDirection} ${p.windSpeed}`,
        forecast: p.shortForecast,
      })),
      fetchedAt: Date.now(),
    };

    (res as any).cacheStore(data);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch weather");
    res.status(502).json({ error: "upstream_unavailable", source: "weather" });
  }
});

export default router;
