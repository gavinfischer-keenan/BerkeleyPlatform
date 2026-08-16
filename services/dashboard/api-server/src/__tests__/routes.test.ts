import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock config
vi.mock('../config.js', () => ({
  getConfig: () => ({
    location: { center: [37.88, -122.26], timezone: 'America/Los_Angeles' },
    server: { cacheDurations: {}, fetchTimeoutMs: 8000, userAgent: 'test' },
    buoys: [{ id: '46026', name: 'SF Buoy' }],
    alerts: { area: 'CA', zones: ['CAZ508'] },
    aircraft: { center: [37.88, -122.26], radiusNm: 150 },
  }),
  getClientConfig: () => ({
    location: { name: 'Test Location' },
    airports: [],
    buoys: []
  })
}));

// Mock the fetcher module — this is what the routes actually call
const mockApiFetch = vi.fn();
vi.mock('../lib/fetcher.js', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  apiFetchJson: vi.fn(),
}));

// Mock cache middleware to be a passthrough
vi.mock('../lib/cache.js', () => ({
  withCache: () => (req: any, res: any, next: any) => {
    res.cacheStore = () => {};
    next();
  },
  invalidateCache: vi.fn(),
}));

// Mock DB for ships
vi.mock('../db.js', () => ({
  getAllVessels: vi.fn(() => [
    { mmsi: 123456789, name: 'Test Ship', last_seen: Date.now() }
  ])
}));

// Import routers after mocks are set up
import configRouter from '../routes/config.js';
import weatherRouter from '../routes/weather.js';
import earthquakesRouter from '../routes/earthquakes.js';
import shipsRouter from '../routes/ships.js';

const app = express();
app.use((req, res, next) => {
  (req as any).log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  next();
});

app.use('/api', configRouter);
app.use('/api', weatherRouter);
app.use('/api', earthquakesRouter);
app.use('/api', shipsRouter);
app.get('/api/health', (_req, res) => res.status(200).send('OK'));

// Helper to create a mock Response
function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe('routes', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('GET /api/config returns location, airports, buoys, etc.', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('location');
    expect(res.body.location.name).toBe('Test Location');
  });

  it('GET /api/weather returns weather data', async () => {
    const mockPoint = {
      properties: {
        forecastHourly: 'https://api.weather.gov/gridpoints/MTR/84,105/forecast/hourly',
        relativeLocation: { properties: { city: 'Berkeley', state: 'CA' } }
      }
    };
    const mockForecast = {
      properties: {
        periods: [
          { number: 1, startTime: '2023-01-01T12:00:00Z', temperature: 65, temperatureUnit: 'F', windSpeed: '5 mph', windDirection: 'W', shortForecast: 'Sunny' }
        ]
      }
    };

    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/points/')) return Promise.resolve(mockResponse(mockPoint));
      if (url.includes('/forecast/hourly')) return Promise.resolve(mockResponse(mockForecast));
      return Promise.resolve(mockResponse('Not Found', 404));
    });

    const res = await request(app).get('/api/weather');
    expect(res.status).toBe(200);
    expect(res.body.location).toBe('Berkeley');
    expect(res.body.tempF).toBe(65);
  });

  it('GET /api/weather returns 502 when upstream fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    
    const res = await request(app).get('/api/weather');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('upstream_unavailable');
  });

  it('GET /api/earthquakes returns earthquake data', async () => {
    const mockQuakes = {
      features: [
        {
          id: 'eq1',
          geometry: { coordinates: [-122.26, 37.88, 5.0] },
          properties: { mag: 3.5, place: 'Berkeley', time: Date.now(), type: 'earthquake' }
        }
      ]
    };

    mockApiFetch.mockResolvedValueOnce(mockResponse(mockQuakes));

    const res = await request(app).get('/api/earthquakes');
    expect(res.status).toBe(200);
    expect(res.body.quakes).toHaveLength(1);
    expect(res.body.quakes[0].mag).toBe(3.5);
  });

  it('GET /api/health returns OK', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('GET /api/ships returns vessel data from DB', async () => {
    const res = await request(app).get('/api/ships');
    expect(res.status).toBe(200);
    expect(res.body.ships).toHaveLength(1);
    expect(res.body.ships[0].name).toBe('Test Ship');
  });
});

