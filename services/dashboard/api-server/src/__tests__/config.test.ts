import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('fs');

describe('config', () => {
  const mockConfig = {
    location: {
      name: 'Test Location',
      center: [10, 20],
      timezone: 'UTC',
      bounds: [[0, 0], [10, 10]],
      wideBounds: [[0, 0], [10, 10]],
      quakeFilter: { minLat: 0, maxLat: 10, minLng: 0, maxLng: 10 },
      cosLatFactor: 1,
      nwsGridpoint: 'ABC'
    },
    airports: [],
    surfSpots: [],
    buoys: [],
    tideStations: [],
    weatherStations: [],
    airQualityPoints: [],
    windGrid: [],
    currentPoints: [],
    alerts: { area: 'A', zones: [] },
    aircraft: { center: [0,0], radiusNm: 1, localIata: [] },
    coastline: { polygons: [] },
    hazards: { faultZones: [], airmetPosition: [0,0], faultBoxPosition: [0,0] },
    bathymetry: {
      depthProfile: '', seeds: {},
      denseGrid: { latRange: [0,0], lngRange: [0,0], latStep: 1, lngStep: 1 },
      superDenseGrid: { latRange: [0,0], lngRange: [0,0], latStep: 1, lngStep: 1 },
      sparseGrid: { latRange: [0,0], lngRange: [0,0], latStep: 1, lngStep: 1 }
    },
    ports: {
      primary: { name: '', coords: [0,0], radiusKm: 1 },
      secondary: { name: '', coords: [0,0], radiusKm: 1 },
      tertiary: { name: '', coords: [0,0], radiusKm: 1 },
      estuary: { latRange: [0,0], lngRange: [0,0] }
    },
    satellite: { goesUrl: '', radarGifUrl: '' },
    externalUrls: {},
    server: { port: 3000, userAgent: 'test-agent', fetchTimeoutMs: 1000, cacheDurations: {} },
    ui: { refreshIntervals: {}, stateRotation: { defaultDurationMs: 1, holdExtraMs: 1 }, map: { minZoom: 1, maxZoom: 2, radarMaxNativeZoom: 1, breadcrumbLimit: 1, maxAircraftSpeedKt: 1 }, colors: {} }
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    delete process.env.DASHBOARD_PORT;
    delete process.env.DASHBOARD_USER_AGENT;
  });

  it('loads and parses default.json correctly', async () => {
    const { getConfig } = await import('../config.js');
    const cfg = getConfig();
    expect(fs.readFileSync).toHaveBeenCalled();
    expect(cfg.location.name).toBe('Test Location');
  });

  it('returns cached config on second call', async () => {
    const { getConfig } = await import('../config.js');
    getConfig();
    getConfig();
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('env var overrides work (DASHBOARD_PORT, etc.)', async () => {
    process.env.DASHBOARD_PORT = '4000';
    process.env.DASHBOARD_USER_AGENT = 'custom-agent';
    
    const mod = await import('../config.js');
    const cfg = mod.getConfig();
    
    expect(cfg.server.port).toBe(4000);
    expect(cfg.server.userAgent).toBe('custom-agent');
  });

  it('getClientConfig() strips server settings', async () => {
    const mod = await import('../config.js');
    const clientCfg = mod.getClientConfig();
    expect((clientCfg as any).server).toBeUndefined();
    expect(clientCfg.location).toBeDefined();
  });
});
