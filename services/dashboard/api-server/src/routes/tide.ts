import { Router } from "express";

const router = Router();

// Tide stations in the Bay Area
const STATIONS = [
  { id: "9414290", name: "San Francisco", coords: [37.806, -122.465] },
  { id: "9414750", name: "Alameda", coords: [37.771, -122.298] },
  { id: "9414863", name: "Richmond", coords: [37.921, -122.368] },
  { id: "9415020", name: "Point Reyes", coords: [38.000, -122.973] },
  { id: "9413450", name: "Monterey", coords: [36.605, -121.889] }
];

type Prediction = { t: string; v: string; type: "H" | "L" };

let cache: { data: unknown; expiresAt: number } | null = null;
const CACHE_MS = 30 * 60 * 1000;

// "YYYY-MM-DD HH:MM" (local clock) → epoch ms, parsed as a naive wall
// clock. We compare against "now" rendered in the same local wall clock, so
// both sides share the same (server) interpretation and the diff is correct.
function parseNaive(s: string): number {
  return new Date(s.replace(" ", "T") + ":00").getTime();
}
function localNowNaive(): number {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(f.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return parseNaive(`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`);
}
function fmtTime(s: string): string {
  const d = new Date(s.replace(" ", "T") + ":00");
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

router.get("/tide", async (req, res) => {
  try {
    if (cache && Date.now() < cache.expiresAt) {
      res.json(cache.data);
      return;
    }

    const df = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dp = Object.fromEntries(df.formatToParts(new Date()).map((p) => [p.type, p.value]));
    const localToday = new Date(`${dp.year}-${dp.month}-${dp.day}T00:00:00Z`);
    const begin = new Date(localToday.getTime() - 24 * 3600 * 1000);
    const beginStr =
      begin.getUTCFullYear().toString() +
      (begin.getUTCMonth() + 1).toString().padStart(2, "0") +
      begin.getUTCDate().toString().padStart(2, "0");

    const now = localNowNaive();

    const fetchTideData = async (station: typeof STATIONS[0]) => {
      try {
        const url =
          `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${beginStr}&range=72` +
          `&station=${station.id}&product=predictions&datum=MLLW&interval=hilo&units=english` +
          `&time_zone=lst_ldt&format=json`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(`NOAA CO-OPS ${r.status}`);
        const j = (await r.json()) as { predictions?: Prediction[] };
        const preds = j.predictions ?? [];
        if (!preds.length) return null;

        const sorted = preds.slice().sort((a, b) => parseNaive(a.t) - parseNaive(b.t));
        const next = sorted.find((p) => parseNaive(p.t) > now) ?? null;
        const prevList = sorted.filter((p) => parseNaive(p.t) <= now);
        const prev = prevList.length ? prevList[prevList.length - 1] : null;

        const state = next ? (next.type === "H" ? "Rising" : "Falling") : "—";
        const shape = (p: Prediction | null) =>
          p ? { type: p.type === "H" ? "High" : "Low", time: fmtTime(p.t), heightFt: Math.round(parseFloat(p.v) * 100) / 100 } : null;

        return {
          id: station.id,
          name: station.name,
          coords: station.coords,
          state,
          next: shape(next),
          prev: shape(prev),
        };
      } catch (err) {
        return null;
      }
    };

    const results = await Promise.all(STATIONS.map(fetchTideData));
    const validResults = results.filter(r => r !== null);

    const data = {
      tides: validResults,
      source: "NOAA CO-OPS",
      fetchedAt: Date.now(),
    };
    cache = { data, expiresAt: Date.now() + CACHE_MS };
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch tide data");
    res.status(502).json({ error: "Failed to fetch tide data" });
  }
});

export default router;


