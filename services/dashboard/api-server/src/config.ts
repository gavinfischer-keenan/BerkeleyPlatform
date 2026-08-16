import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Dashboard Configuration Loader
// ---------------------------------------------------------------------------
// Loads config/default.json and exposes a typed, frozen config object.
// Environment variable overrides are supported for key deployment settings.
//
// Usage:
//   import { getConfig } from '../config/config.js';
//   const cfg = getConfig();
//   console.log(cfg.location.center); // [37.88, -122.26]
// ---------------------------------------------------------------------------

export interface DashboardConfig {
  location: {
    name: string;
    center: [number, number];
    timezone: string;
    bounds: [[number, number], [number, number]];
    wideBounds: [[number, number], [number, number]];
    quakeFilter: { minLat: number; maxLat: number; minLng: number; maxLng: number };
    cosLatFactor: number;
    nwsGridpoint: string;
  };
  airports: Array<{ code: string; coords: [number, number]; primary?: boolean }>;
  surfSpots: Array<{ name: string; coords: [number, number]; buoyId: string; scale: number; cssScale: number; nudge?: [number, number] }>;
  buoys: Array<{ id: string; name: string; coords: [number, number] }>;
  tideStations: Array<{ id: string; name: string; coords: [number, number] }>;
  weatherStations: Array<{ id: string; name: string; coords: [number, number] }>;
  airQualityPoints: Array<{ name: string; lat: number; lon: number }>;
  windGrid: Array<{ lat: number; lon: number }>;
  currentPoints: Array<{ name: string; lat: number; lon: number }>;
  alerts: { area: string; zones: string[] };
  aircraft: { center: [number, number]; radiusNm: number; localIata: string[] };
  coastline: { polygons: Array<{ name: string; coords: [number, number][] }> };
  hazards: {
    faultZones: Array<{ name: string; distance: string; direction: string }>;
    airmetPosition: [number, number];
    faultBoxPosition: [number, number];
  };
  bathymetry: {
    depthProfile: string;
    seeds: Record<string, string>;
    denseGrid: { latRange: [number, number]; lngRange: [number, number]; latStep: number; lngStep: number };
    superDenseGrid: { latRange: [number, number]; lngRange: [number, number]; latStep: number; lngStep: number };
    sparseGrid: { latRange: [number, number]; lngRange: [number, number]; latStep: number; lngStep: number };
  };
  ports: {
    primary: { name: string; coords: [number, number]; radiusKm: number };
    secondary: { name: string; coords: [number, number]; radiusKm: number };
    tertiary: { name: string; coords: [number, number]; radiusKm: number };
    estuary: { latRange: [number, number]; lngRange: [number, number] };
  };
  satellite: { goesUrl: string; radarGifUrl: string };
  externalUrls: Record<string, string>;
  server: {
    port: number;
    userAgent: string;
    fetchTimeoutMs: number;
    cacheDurations: Record<string, number>;
  };
  ui: {
    refreshIntervals: Record<string, number>;
    stateRotation: { defaultDurationMs: number; holdExtraMs: number };
    map: { minZoom: number; maxZoom: number; radarMaxNativeZoom: number; breadcrumbLimit: number; maxAircraftSpeedKt: number };
    colors: Record<string, string>;
  };
}

let _config: DashboardConfig | null = null;

/**
 * Load and return the dashboard configuration.
 * The config is loaded once from disk and cached for the process lifetime.
 * Environment variables can override key settings:
 *   - DASHBOARD_PORT          → server.port
 *   - DASHBOARD_USER_AGENT    → server.userAgent
 *   - DASHBOARD_FETCH_TIMEOUT → server.fetchTimeoutMs
 *   - DASHBOARD_TIMEZONE      → location.timezone
 *   - DASHBOARD_CENTER_LAT    → location.center[0]
 *   - DASHBOARD_CENTER_LNG    → location.center[1]
 */
export function getConfig(): DashboardConfig {
  if (_config) return _config;

  // Look for config relative to the project root (2 levels up from src/config/)
  const configPath = path.resolve(__dirname, '..', '..', 'config', 'default.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const cfg = JSON.parse(raw) as DashboardConfig;

  // Apply environment variable overrides
  if (process.env.DASHBOARD_PORT) {
    cfg.server.port = parseInt(process.env.DASHBOARD_PORT, 10);
  }
  if (process.env.DASHBOARD_USER_AGENT) {
    cfg.server.userAgent = process.env.DASHBOARD_USER_AGENT;
  }
  if (process.env.DASHBOARD_FETCH_TIMEOUT) {
    cfg.server.fetchTimeoutMs = parseInt(process.env.DASHBOARD_FETCH_TIMEOUT, 10);
  }
  if (process.env.DASHBOARD_TIMEZONE) {
    cfg.location.timezone = process.env.DASHBOARD_TIMEZONE;
  }
  if (process.env.DASHBOARD_CENTER_LAT) {
    cfg.location.center[0] = parseFloat(process.env.DASHBOARD_CENTER_LAT);
  }
  if (process.env.DASHBOARD_CENTER_LNG) {
    cfg.location.center[1] = parseFloat(process.env.DASHBOARD_CENTER_LNG);
  }

  _config = cfg;
  return _config;
}

/**
 * Returns a subset of the config safe for the frontend.
 * Excludes server-only settings like cache durations.
 */
export function getClientConfig(): Omit<DashboardConfig, 'server'> {
  const cfg = getConfig();
  const { server: _server, ...clientCfg } = cfg;
  return clientCfg;
}
