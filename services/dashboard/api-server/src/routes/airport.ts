/**
 * Airport Route
 * Fetches FAA NAS status for primary config-defined airports.
 */
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { getConfig } from '../config.js';
import { withCache } from '../lib/cache.js';
import { apiFetch } from '../lib/fetcher.js';

const router = Router();

router.get("/airport", withCache('airport'), async (req: Request, res: Response) => {
    const cfg = getConfig();
    try {
        const response = await apiFetch("https://nasstatus.faa.gov/api/airport-events");
        
        if (!response.ok) {
            throw new Error(`FAA API returned ${response.status}`);
        }
        
        const data = await response.json() as any[];
        const primaryAirports = cfg.airports.filter(a => a.primary);
        
        function getStatus(airport: any, name: string) {
            let status = "NORMAL OPERATIONS";
            let color = "#1dd1a1"; // Green
            let details = "No known delays or closures at this time.";
            let rank = 0;
            
            if (airport) {
                if (airport.airportClosure) {
                    status = "AIRPORT CLOSED";
                    color = "#ee5253"; // Red
                    details = airport.airportClosure.simpleText || "Runways closed.";
                    rank = 6;
                } else if (airport.groundStop) {
                    status = "GROUND STOP";
                    color = "#ee5253"; // Red
                    details = `Reason: ${airport.groundStop.impactingCondition || 'Unknown'}. End: ${new Date(airport.groundStop.endTime).toLocaleTimeString()}`;
                    rank = 5;
                } else if (airport.groundDelay) {
                    status = "GROUND DELAY";
                    color = "#ff9f43"; // Orange
                    details = `Avg delay: ${airport.groundDelay.avgDelay} min. Reason: ${airport.groundDelay.impactingCondition || 'Unknown'}.`;
                    rank = 4;
                } else if (airport.departureDelay) {
                    status = "DEPARTURE DELAY";
                    color = "#fdcb6e"; // Yellow
                    details = `Delay: ${airport.departureDelay.arrivalDeparture?.min || ''} - ${airport.departureDelay.arrivalDeparture?.max || ''}. Reason: ${airport.departureDelay.reason || 'Unknown'}`;
                    rank = 3;
                } else if (airport.arrivalDelay) {
                    status = "ARRIVAL DELAY";
                    color = "#fdcb6e"; // Yellow
                    details = `Reason: ${airport.arrivalDelay.reason || 'Unknown'}`;
                    rank = 2;
                } else if (airport.freeForm) {
                    status = "ADVISORY";
                    color = "#a29bfe"; // Purple
                    details = airport.freeForm.text || airport.freeForm.simpleText || "General advisory.";
                    rank = 1;
                }
            }
            if (rank > 0) details = `[${name}] ` + details;
            return { status, color, details, rank };
        }

        const statuses = primaryAirports.map(pa => {
            const airportData = data.find((a: any) => a.airportId === pa.code);
            return getStatus(airportData, pa.code);
        });

        // Find the worst status
        const worst = statuses.reduce((prev, current) => (prev.rank > current.rank) ? prev : current, { rank: -1 } as any);
        
        const status = worst.rank >= 0 ? worst.status : "NORMAL OPERATIONS";
        const color = worst.rank >= 0 ? worst.color : "#1dd1a1";
        const details = worst.rank >= 0 ? worst.details : "No known delays or closures at this time.";
        
        const result = {
            status,
            color,
            details
        };
        (res as any).cacheStore(result);
        res.json(result);
    } catch (error: any) {
        logger.error({ err: error }, "Error fetching airport status");
        res.status(502).json({ error: "upstream_unavailable", source: "airport" });
    }
});

export default router;
