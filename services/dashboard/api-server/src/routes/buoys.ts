/**
 * Buoys Route
 * Fetches recent NDBC buoy observations from the config-defined buoy list.
 */
import { Router } from "express";
import { getConfig } from '../config.js';
import { withCache } from '../lib/cache.js';
import { apiFetch } from '../lib/fetcher.js';

const router = Router();

async function fetchBuoy(id: string): Promise<Record<string, string | number | null>> {
  const url = `https://www.ndbc.noaa.gov/data/realtime2/${id}.txt`;
  const res = await apiFetch(url);

  if (!res.ok) throw new Error(`NDBC ${id} responded ${res.status}`);

  const text = await res.text();
  const lines = text.trim().split("\n");

  // Row 0: header names, Row 1: units, Row 2+: data (newest first)
  const headers = lines[0].replace(/^#/, "").trim().split(/\s+/);
  const dataLine = lines[2]?.trim().split(/\s+/) ?? [];

  const row: Record<string, string> = {};
  headers.forEach((h, i) => {
    row[h] = dataLine[i] ?? "MM";
  });

  const num = (key: string): number | null => {
    const v = row[key];
    return v && v !== "MM" ? parseFloat(v) : null;
  };

  return {
    id,
    waveHeight: num("WVHT"),
    dominantPeriod: num("DPD"),
    windSpeed: num("WSPD"),
    windSpeedKt: num("WSPD") != null ? Math.round((num("WSPD") as number) * 1.94384) : null,
    windDir: num("WDIR"),
    waterTemp: num("WTMP"),
    airTemp: num("ATMP"),
    pressure: num("PRES"),
    time: `${row["YY"] ?? row["#YY"]}-${row["MM"]}-${row["DD"]} ${row["hh"]}:${row["mm"]} UTC`,
  };
}

router.get("/buoys", withCache('buoys'), async (req, res) => {
  const cfg = getConfig();
  try {
    const results = await Promise.allSettled(
      cfg.buoys.map(async (b) => {
        const data = await fetchBuoy(b.id);
        return { ...data, name: b.name };
      }),
    );

    const buoys = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return { id: cfg.buoys[i].id, name: cfg.buoys[i].name, error: "unavailable" };
    });

    const data = { buoys, fetchedAt: Date.now() };
    (res as any).cacheStore(data);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch buoys");
    res.status(502).json({ error: "upstream_unavailable", source: "buoys" });
  }
});

export default router;

