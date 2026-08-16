# Dashboard Configuration Reference

The dashboard is fully config-driven. All location-specific values, station IDs,
API endpoints, timings, and UI settings are centralized in a single JSON file.

## File Location

```
services/dashboard/config/default.json
```

To deploy the dashboard to a different location, copy this file, modify the
values, and point the server at your copy via the config loader.

---

## Configuration Sections

### `location` — Geographic Center & Boundaries

| Key | Type | Description |
|-----|------|-------------|
| `name` | string | Dashboard display name (shown in UI title) |
| `center` | [lat, lng] | Geographic center of the monitoring area |
| `timezone` | string | IANA timezone (e.g., `America/Los_Angeles`) |
| `bounds` | [[lat,lng],[lat,lng]] | Default map view bounding box |
| `wideBounds` | [[lat,lng],[lat,lng]] | Wide/zoomed-out view bounding box |
| `quakeFilter` | object | Lat/lng box for filtering earthquake data |
| `cosLatFactor` | number | Cosine of latitude × 111 km (for distance math) |
| `nwsGridpoint` | string | NWS forecast office/grid (e.g., `MTR/84,105`) |

### `airports` — Airport Markers & Status Tracking

Array of airports. Airports with `"primary": true` are checked for FAA status.

| Key | Type | Description |
|-----|------|-------------|
| `code` | string | IATA airport code |
| `coords` | [lat, lng] | Map marker position |
| `primary` | boolean | If true, queried for FAA delay status |

### `surfSpots` — Surf Forecast Locations

| Key | Type | Description |
|-----|------|-------------|
| `name` | string | Display name |
| `coords` | [lat, lng] | Map marker position |
| `buoyId` | string | Associated NDBC buoy for wave data |
| `scale` | number | Wave height multiplier for display |

### `buoys` — NDBC Buoy Stations

| Key | Type | Description |
|-----|------|-------------|
| `id` | string | NDBC station ID (e.g., `46026`) |
| `name` | string | Human-readable name |
| `coords` | [lat, lng] | Fallback position if API doesn't provide one |

### `tideStations` — NOAA CO-OPS Tide Stations

| Key | Type | Description |
|-----|------|-------------|
| `id` | string | CO-OPS station ID (e.g., `9414290`) |
| `name` | string | Station name |
| `coords` | [lat, lng] | Map marker position |

### `weatherStations` — NWS Weather Observation Stations

| Key | Type | Description |
|-----|------|-------------|
| `id` | string | Station callsign (e.g., `KOAK`) |
| `name` | string | Display name |
| `coords` | [lat, lng] | Station position |

### `airQualityPoints` — Air Quality Monitoring Grid

Array of points where Open-Meteo AQI data is fetched.

### `windGrid` — Wind Observation Grid

Array of lat/lon points forming a grid for wind data fetch.

### `currentPoints` — Ocean Current Monitoring Points

Array of offshore points for Open-Meteo marine current data.

### `alerts` — NWS Weather Alert Filtering

| Key | Type | Description |
|-----|------|-------------|
| `area` | string | NWS area code (e.g., `CA`) |
| `zones` | string[] | NWS zone codes (e.g., `["CAZ508"]`) |

### `aircraft` — Aircraft Tracking Configuration

| Key | Type | Description |
|-----|------|-------------|
| `center` | [lat, lng] | Center point for ADS-B query |
| `radiusNm` | number | Search radius in nautical miles |
| `localIata` | string[] | Local airport IATA codes (for filtering local vs long-haul) |

### `coastline` — Land Mass Polygons

Polygon coordinate arrays used for coastline rendering and distance-to-shore calculations.

### `hazards` — Fault Zones & Warning Positions

| Key | Type | Description |
|-----|------|-------------|
| `faultZones` | array | Nearby fault lines with name, distance, direction |
| `airmetPosition` | [lat, lng] | Position for AIRMET warning box |
| `faultBoxPosition` | [lat, lng] | Position for fault zone status box |

### `bathymetry` — Depth Grid Configuration

| Key | Type | Description |
|-----|------|-------------|
| `depthProfile` | string | Profile type: `continental_shelf` or `volcanic` |
| `seeds` | object | Seeded random number seeds for consistent rendering |
| `denseGrid` | object | Dense bathymetry grid bounds and step sizes |
| `superDenseGrid` | object | Super-dense grid (harbor zoom view) |
| `sparseGrid` | object | Sparse grid (wide view) |

### `ports` — Harbor / Port Definitions

| Key | Type | Description |
|-----|------|-------------|
| `primary` | object | Main port (name, coords, radius for detection) |
| `secondary` | object | Secondary port |
| `tertiary` | object | Tertiary port |
| `estuary` | object | Estuary bounding box (lat/lng ranges) |

### `satellite` — Satellite Imagery URLs

| Key | Type | Description |
|-----|------|-------------|
| `goesUrl` | string | GOES-18 GeoColor animated GIF URL |
| `radarGifUrl` | string | NWS MRMS radar loop GIF URL |

### `externalUrls` — External Service Endpoints

Base URLs for external data sources (RainViewer, Open-Meteo, NWS, etc.)

### `server` — Server-Side Settings

| Key | Type | Description |
|-----|------|-------------|
| `port` | number | HTTP listen port |
| `userAgent` | string | User-Agent string for outgoing API calls |
| `fetchTimeoutMs` | number | Timeout for upstream API requests |
| `cacheDurations` | object | Cache TTL per route (in milliseconds) |

### `ui` — Frontend UI Settings

| Key | Type | Description |
|-----|------|-------------|
| `refreshIntervals` | object | Polling interval per data type (in milliseconds) |
| `stateRotation` | object | Dashboard rotation timing |
| `map` | object | Map zoom/breadcrumb/speed limits |
| `colors` | object | Named color tokens for hazard/accent/text |

---

## Environment Variable Overrides

The config loader supports these env vars to override settings without editing the JSON:

| Environment Variable | Overrides |
|---------------------|-----------|
| `DASHBOARD_PORT` | `server.port` |
| `DASHBOARD_USER_AGENT` | `server.userAgent` |
| `DASHBOARD_FETCH_TIMEOUT` | `server.fetchTimeoutMs` |
| `DASHBOARD_TIMEZONE` | `location.timezone` |
| `DASHBOARD_CENTER_LAT` | `location.center[0]` |
| `DASHBOARD_CENTER_LNG` | `location.center[1]` |

---

## How to Relocate the Dashboard

To deploy the dashboard for a different geographic area:

1. Copy `config/default.json` to a new file (e.g., `config/seattle.json`)
2. Update all location-specific values:
   - `location.center`, `bounds`, `wideBounds`, `quakeFilter`
   - `airports`, `surfSpots`, `buoys`, `tideStations`, `weatherStations`
   - `airQualityPoints`, `windGrid`, `currentPoints`
   - `alerts` zones
   - `aircraft` center and local IATA codes
   - `coastline` polygons
   - `hazards`, `bathymetry`, `ports`
   - `satellite` and `externalUrls` (GOES sector, NWS gridpoint)
3. Point the config loader at the new file (modify the path in `config.ts`)
4. Restart the server
