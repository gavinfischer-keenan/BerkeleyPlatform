/**
 * Route Registry
 *
 * All API routes are mounted here under the /api prefix.
 * Each route file is responsible for a single data domain.
 */
import { Router, type IRouter } from "express";
import aircraftRouter from "./aircraft";
import airportRouter from "./airport";
import airqualityRouter from "./airquality";
import alertsRouter from "./alerts";
import buoysRouter from "./buoys";
import configRouter from "./config";
import currentsRouter from "./currents";
import earthquakesRouter from "./earthquakes";
import healthRouter from "./health";
import shipsRouter from "./ships";
import stationsRouter from "./stations";
import tideRouter from "./tide";
import turbulenceRouter from "./turbulence";
import weatherRouter from "./weather";
import windRouter from "./wind";
import { uploadRouter } from "./upload.js";

const router: IRouter = Router();

// Configuration (frontend fetches this on boot)
router.use(configRouter);

// Health check
router.use(healthRouter);

// Data routes (alphabetical)
router.use(aircraftRouter);
router.use(airportRouter);
router.use(airqualityRouter);
router.use(alertsRouter);
router.use(buoysRouter);
router.use(currentsRouter);
router.use(earthquakesRouter);
router.use(shipsRouter);
router.use(stationsRouter);
router.use(tideRouter);
router.use(turbulenceRouter);
router.use(weatherRouter);
router.use(windRouter);

// Admin
router.use("/upload", uploadRouter);

export default router;

