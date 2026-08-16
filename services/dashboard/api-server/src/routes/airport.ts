import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router = Router();

router.get("/airport", async (req: Request, res: Response) => {
    try {
        const response = await fetch("https://nasstatus.faa.gov/api/airport-events", { signal: AbortSignal.timeout(8000),
            headers: {
                "User-Agent": "MosswoodCommandCenter/1.0"
            }
        });
        
        if (!response.ok) {
            throw new Error(`FAA API returned ${response.status}`);
        }
        
        const data = await response.json() as any[];
        const sfo = data.find((a: any) => a.airportId === "SFO");
        const oak = data.find((a: any) => a.airportId === "OAK");
        
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

        const sfoStatus = getStatus(sfo, "SFO");
        const oakStatus = getStatus(oak, "OAK");
        const worst = sfoStatus.rank >= oakStatus.rank ? sfoStatus : oakStatus;
        
        const status = worst.status;
        const color = worst.color;
        const details = worst.details;
        
        res.json({
            status,
            color,
            details
        });
    } catch (error: any) {
        logger.error({ err: error }, "Error fetching airport status");
        res.json({
            status: "STATUS UNAVAILABLE",
            color: "#636e72", // Gray
            details: "Could not fetch data from FAA systems."
        });
    }
});

export default router;

