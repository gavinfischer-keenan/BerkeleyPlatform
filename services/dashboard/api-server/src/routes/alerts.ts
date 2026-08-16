import { Router } from "express";

const router = Router();

let cache: { data: unknown; expiresAt: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

router.get("/alerts", async (req, res) => {
  try {
    if (cache && Date.now() < cache.expiresAt) {
      res.json(cache.data);
      return;
    }

    // Fetch active NWS alerts for CA (land) and CAZ508 (coastal marine)
    const [rHI, rPH] = await Promise.all([
      fetch("https://api.weather.gov/alerts/active?area=CA", { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "MosswoodCommandCenter/1.0 (contact@example.com)" },
      }),
      fetch("https://api.weather.gov/alerts/active?zone=CAZ508", { signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "MosswoodCommandCenter/1.0 (contact@example.com)" },
      })
    ]);

    if (!rHI.ok) throw new Error(`NWS alerts CA ${rHI.status}`);
    if (!rPH.ok) throw new Error(`NWS alerts CAZ508 ${rPH.status}`);

    const jsonHI = (await rHI.json()) as { features: any[] };
    const jsonPH = (await rPH.json()) as { features: any[] };

    const allFeatures = [...(jsonHI.features || []), ...(jsonPH.features || [])];

    const alerts = allFeatures.map((f: any) => ({
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
    cache = { data, expiresAt: Date.now() + CACHE_MS };
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch NWS alerts");
    res.status(502).json({ error: "Failed to fetch alerts", alerts: [] });
  }
});

export default router;


