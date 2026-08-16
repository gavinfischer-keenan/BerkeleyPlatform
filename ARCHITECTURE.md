# Berkeley Home Intelligence Platform — System Architecture

## Design Philosophy

**Multiple specialized agents, one shared bus.** Each agent is a standalone Python service
that owns one sensor domain. Agents communicate exclusively through MQTT (Mosquitto).
No agent calls another directly — reducing coupling to zero.

> "The architecture has to support the streaming of the audio — the capturing
> of events that have occurred... the audio and the video will need to be stored
> for analysis both in realtime and as stored events when tagged."

The physical deployment follows a **High-Availability (HA) Enterprise Architecture** that
segregates the **Control Plane** (life-safety, automation, telemetry logging) from the
**Compute Node** (experimental AI, heavy batch processing). This ensures that heavy AI models
can be pushed to maximum utilization without risking the operational integrity or
voice-response systems of the property.

---

## Alerts vs Messages — A Core Distinction

The platform carries two fundamentally different types of asynchronous information:

| | **Alert** | **Message** |
|--|-----------|-------------|
| **Nature** | THING HAPPENED | Agent has an observation |
| **Urgency** | Now / Soon | Whenever you read it |
| **Content** | Short, structured | Rich text, long-form, may include data |
| **Delivery** | Alexa voice, display banner, all channels | Dashboard inbox, low-priority push |
| **Action** | None required — just awareness | May request action (classify, approve, review) |
| **MQTT root** | `home/alerts/#` | `home/messages/#` |
| **Service** | BerkeleyAlarms | BerkeleyMessages |
| **Retention** | Alarm history in SQLite | Message inbox in SQLite |

**Alert** = something loud is yelling at you to act now.
**Message** = an AI agent quietly set something on your desk for you to read.

Message sub-types:
- `observation`  — "BirdNET detected a Great Horned Owl at 11:32pm"
- `request`      — "Unusual seismic signature, please classify: [link]"
- `summary`      — "Daily garden report — zone 4 moisture consistently high"
- `anomaly`      — "Power consumption pattern changed — see attached chart"

---

## Hardware Topology

*(Confirmed as of 2026-08-16)*

### Node 01 — Control Plane (Dell OptiPlex SFF)
**Role:** The stable, un-crashable heart of the property. Handles all hardware interfaces, MQTT messaging, life-safety logic, and low-latency voice/vision processing.

- **CPU:** Intel Core i7-8700 (6C/12T)
- **RAM:** 64GB DDR4
- **Boot Drive:** 2TB M.2 NVMe
- **Data Drive:** 1TB internal SSD (Proxmox storage pool `local-data` for InfluxDB + Frigate)
- **GPU:** Intel UHD 630 (QuickSync for Frigate)
- **TPU:** Google Coral USB TPU (arriving Day 2 / Monday after launch)
- **UPS:** CyberPower CP1500PFCLCD PFC Sinewave (with USB for NUT shutdown signaling)
- **Network:** Connected to 2.5GbE switch
- **OS:** Proxmox VE 8.x (bare-metal)

### Node 02 — Compute Node (Gigabyte GFCANADA)
**Role:** The "Brain in a Jar." Wakes on API requests from Node 01 (or when the property is vacant) to run deep-dive data correlation, biological behavioural analysis, and large language models.
**Timeline:** Comes online AFTER Node 01 is stable.

- **Motherboard:** Gigabyte B650 GAMING X AX
- **CPU:** AMD Ryzen 7 7800X3D (8C/16T, 3D V-Cache)
- **RAM:** 64GB DDR5 (2×32GB)
- **GPU:** NVIDIA RTX 4080 SUPER (16GB VRAM)
- **iGPU:** AMD Radeon (for Proxmox console)
- **Storage:** 3× 2TB NVMe = 6TB total:
  - Kingston SNV2S2000G (Proxmox boot)
  - Samsung 990 Pro 2TB PCIe 4.0 (AI model buffer)
  - Samsung 9100 Pro 2TB PCIe 5.0 (batch data)
- **Network:** Realtek 2.5GbE (native on board)
- **UPS:** Shared CyberPower CP1500PFCLCD
- **OS:** Proxmox VE 8.x (bare-metal, after Windows 11 data migration)

### Node 03 / Edge Swarm
- **Raspberry Pi 5:** SDR dongles (ADS-B / AIS) + USB mics for local inference
- **ESP32 Devices:** ESPHome mmWave, environmental sensors → MQTT
- **Raspberry Shake RS4D/RBOOM:** Seismic monitoring, already online at rs.local
- **PoE IP Camera Array:** Panoramic overwatch, fixed bullet, variable-focal targeted
- **Z-Wave USB Stick:** Gateway for smoke/CO detectors

---

## Deployment Topology

### Node 01 Services

| Container/VM | Type | Resources | Purpose |
|-------------|------|-----------|--------|
| `haos` | VM | 4 vCPU, 4GB RAM, 32GB disk | Home Assistant OS (Master state machine) |
| `mosquitto` | LXC | 1 vCPU, 512MB | MQTT Broker (Central bus) |
| `influxdb` | LXC | 2 vCPU, 4GB, 500GB on data SSD | Time-series DB |
| `frigate` | Docker | 2 vCPU, 6GB, QuickSync → Coral Day 2 | NVR |
| `wyoming` | LXC | 2 vCPU, 2GB | Voice Pipeline (openWakeWord + Faster-Whisper) |
| `nginx` | LXC | 1 vCPU, 512MB | Reverse proxy (routes internal/public traffic) |
| overhead | - | ~6GB | Proxmox + ZFS ARC |
| headroom | - | ~41GB | Future services |

### Node 02 Services

| Container/VM | Type | Resources | Storage | Purpose |
|-------------|------|-----------|---------|--------|
| `ollama` | LXC/VM | 4 vCPU, 16GB, GPU passthrough | Samsung 990 Pro | LLM inference (Llama-3, LLaVA) |
| `berkeley-dashboard` | Docker | 2 vCPU, 4GB | Kingston boot | Dashboard + API (Ported) |
| `correlation-agents` | Docker | 4 vCPU, 8GB | Samsung 9100 Pro | Data correlation |
| `ai-garden` | Docker | 2 vCPU, 2GB | Kingston boot | Irrigation AI |
| overhead | - | ~8GB | - | Proxmox + GPU driver |
| headroom | - | ~26GB | - | Future |

---

## Dashboard Architecture

The dashboard code has been ported from the Hawaii project to `services/dashboard/` in the BerkeleyPlatform repository.

### API Server (`services/dashboard/api-server/`)
Express.js TypeScript API server providing 14 routes re-centered to Bay Area coordinates:
- `earthquakes.ts` — USGS, center 37.88/-122.26, 300km radius
- `aircraft.ts` — ADSB.fi, center 37.88/-122.26, 150nm
- `weather.ts` — NWS, Berkeley coords
- `airquality.ts` — Open-Meteo, 7 Bay Area points
- `wind.ts` — Open-Meteo, 12-point Bay Area grid
- `buoys.ts` — NDBC stations 46026, 46012, 46013, 46214, 46237, FTPC1
- `tide.ts` — NOAA CO-OPS: SF, Alameda, Richmond, Pt Reyes, Monterey
- `alerts.ts` — NWS zones CA + CAZ508
- `currents.ts` — Open-Meteo Marine, 6 offshore points
- `airport.ts` — FAA status SFO + OAK
- `stations.ts` — NWS weather: OAK, SFO, NUQ, CCR, APC, SUU, HWD
- `turbulence.ts` — FAA AIRMET/SIGMET (national, location-agnostic)
- `ships.ts` — AISStream WebSocket (to be replaced by local SDR MQTT)
- `upload.ts` — Data ingest endpoint

### Frontend (`services/dashboard/frontend/`)
Leaflet.js SPA with a 6-state rotating dashboard, split into ES modules:
- `state.js` — Shared mutable state (map, layers, liveData, surfSpots)
- `map-setup.js` — Leaflet initialization, panes, base tiles
- `geo.js` — Coastline polygons, bathymetry grids, distance math
- `render.js` — Marker/icon builders, DOM helpers, declutter engine
- `fetch.js` — All 14 API fetch functions (weather, buoys, aircraft, etc.)
- `ui-states.js` — Dashboard state definitions (Meteorological, Surf, Traffic, Hazard, Satellite, Radar)
- `engine.js` — State machine, pagination, view transitions
- `main.js` — Entry point: boot sequence, interval scheduling, FPS monitor
- `style.css` — Styling with CSS custom properties (:root design tokens)

**Ship Tracking Evolution:**
Currently reads from local vessel observation DB via `/api/ships`.
*Future:* Local AIS SDR on Pi 5 → MQTT `home/sensors/ais/{mmsi}` → populates vessel DB.

---

## Layers

### 1. Sensor Layer (hardware → data)

| Source | Transport | Frequency |
|--------|-----------|-----------|
| Raspberry Shake RS4D | UDP → EQ Engine | 100 Hz continuous |
| Pi Environmental Station | MQTT | 30 s intervals |
| RTSP Microphones (×4–6) | TCP/RTSP → Audio Receiver | 15 s chunks |
| PoE IP Cameras | RTSP → Frigate (Node 01) | 30 FPS continuous |
| HLK-LD2410 mmWave (×5, ESPHome) | WiFi → MQTT | On change |
| Soil probes (ESP32) | WiFi → MQTT | 5 min intervals |
| First Alert ZCOMBO-G smoke+CO | Z-Wave → HA → MQTT | On alarm |
| AirGradient ONE (CO2/PM2.5) | WiFi → MQTT | 60 s intervals |
| Leak sensors | Zigbee → Zigbee2MQTT → MQTT | On change |
| CT clamps (power, per circuit) | WiFi → MQTT | 10 s intervals |
| Room temp sensors | Zigbee → MQTT | 60 s intervals |
| Rachio irrigation | REST API polling (via HA) | 5 min intervals |
| ADS-B / AIS SDR (Pi 5) | USB → Pi 5 → BerkeleyTracker | Continuous |

### 2. Agent Layer (data → intelligence)

Each agent:
- Subscribes to its domain topics on MQTT
- Runs analysis / ML models
- Publishes events and alerts to MQTT
- Stores data in InfluxDB (time-series) or EventStore (tagged events)
- Implements the standard lifecycle (LWT, online/offline, heartbeat)

| Agent | Node | Domain | Storage | Output |
|-------|------|--------|---------|--------|
| EarthquakePredictionEngine | 01 | Seismic | miniSEED files | Alerts: CRITICAL |
| BerkeleyEnvironmental | 01 | Weather/fire/air | InfluxDB | Alerts: HIGH |
| BerkeleyAudioReceiver | 01/Pi5 | Birds/bats/audio | WAV + EventStore | Events + Messages |
| BerkeleyHomeSensors | 01 | House infra | InfluxDB | Alerts: CRITICAL/HIGH |
| BerkeleyTracker | Pi5 | ADS-B + AIS | InfluxDB + EventStore | Events: LOW |
| **BerkeleyAlarms** | **01** | **All alert types** | **SQLite alarms.db** | **Alexa TTS + Display + Push** |
| **BerkeleyMessages** | **01** | **AI agent messages** | **SQLite messages.db** | **Dashboard inbox + low-pri push** |
| VisionAgent (future) | 01 | Cameras (Frigate) | Video clips + EventStore | Events + Alerts |
| AI Garden Agent (future) | 02 | Irrigation/plant health | EventStore | Messages: observations |
| CrossModal AI (future) | 02 | Multi-modal correlation | EventStore correlations | Messages: summaries |

### 3. Storage Layer (persistence)

```
Node 01 — InfluxDB 2.7 (1TB SSD local-data pool)
├── sensors-raw     (30 days)   ← environmental station readings
├── house-raw       (30 days)   ← soil, leak, power, climate, occupancy
├── house-hourly    (1 year)    ← downsampled aggregates
└── house-daily     (forever)   ← daily summaries for ML

Node 01 — SQLite (EventStore / AlarmStore / MessageStore)
├── events.db                   ← tagged events from all agents
├── alarms.db                   ← alarm history (resolved alarms archive)
└── messages.db                 ← AI agent message inbox (read/unread/archived)

Node 01 — Local Filesystem (2TB NVMe & 1TB SSD)
├── /data/audio/                ← archived WAV/FLAC clips
├── /data/seismic/              ← miniSEED waveform files
└── /data/video/                ← archived video clips (Frigate on local-data SSD)

Node 02 — Local Filesystem (Samsung 990/9100 NVMe)
├── /models/                    ← Ollama model cache (Llama-3, LLaVA on 990 Pro)
└── /data/batch/                ← Batch data storage (9100 Pro)
```

### 4. Consumer Layer (intelligence → humans)

#### Notification Channels (BerkeleyAlarms dispatch)

| Channel | MQTT Topic | Status | Priority Use |
|---------|-----------|--------|--------------|
| Alexa TTS | `home/commands/alexa-say` | Active | time_critical, high |
| Display Banner | `home/commands/display` | Active | time_critical, high, normal |
| Rotating Display | `home/commands/rotating-display` | Stub | normal, low |
| Push Notification | `home/commands/push` | Stub | future (Pushover/Gotify) |
| Command Panel | `home/commands/panel` | Stub | future (touch panel) |

#### Dashboard Surfaces

| Dashboard | Node | URL | Audience | Content |
|-----------|------|-----|----------|---------|
| **Internal Dashboard** | **02** | **`home.mosswood.internal:8090`** | **Household (LAN/VPN)** | **House data, alarms, messages, garden, cameras** |
| **Public Site** | **02** | **`mosswood.science` (public DNS)** | **Anyone** | **Seismograph, env, BirdNET, weather** |
| Alarm Console | 01 | port 8084 | Household | Active alarm management |
| Mosswood Intelligence Briefing | 02 | Node 02 browser | Household | Deep AI analysis |
| Home Assistant | 01 | iPhone/Apple Watch/Alexa | Household | Automations + device control |

---

## Two-Dashboard Architecture

```
nginx (Node 01 LXC)
 │
 ├─ internal vhost: home.mosswood.internal
 │    ├── / ──────────────────────→ Node 02 BerkeleyDashboard :8090 /internal/*
 │    │   (LAN-only bind / VPN required from internet)
 │    └── All paths → full data access
 │
 └─ public vhost: mosswood.science (public IP)
      ├── / ──────────────────────→ Node 02 BerkeleyDashboard :8090 /public/*
      └── Only /api/public/* paths forwarded (scoped, no house data)

BerkeleyDashboard (Node 02, port 8090 — Express/Leaflet)
 ├── /internal/           Internal SPA — full data
 │   ├── Alarm panel      ← BerkeleyAlarms API
 │   ├── Message inbox    ← BerkeleyMessages API
 │   ├── Garden           ← HomeSensors soil/Rachio data
 │   ├── House sensors    ← HomeSensors temp/power/occupancy
 │   ├── BirdNET (full)   ← AudioReceiver private feed
 │   └── System health    ← All agent heartbeats
 │
 └── /public/             Public SPA — curated data only
     ├── Seismograph      ← EQ Engine live data
     ├── Environmental    ← Air quality, weather, rain
     ├── BirdNET sightings← Species log (no location, no audio)
     ├── EQ event log     ← Our sensor vs USGS comparison
     └── About            ← What the platform is
```

*(Note: BerkeleyDashboard container runs on Node 02, while Nginx handles ingress on Node 01)*

---

## Network Topology

```
  Internet
     │
  [Router / Firewall]
     │  ├── Port 80/443 → nginx public vhost (Node 01) → /public/* only
     │
  ┌──┴──────── Local LAN (192.168.1.x) [2.5GbE Switch + UPS] ──────────┐
  │                                                                     │
  │  Node 01 — Dell OptiPlex (Control Plane) [2.5GbE]                  │
  │  ├── Proxmox VE (hypervisor)                                        │
  │  ├── Home Assistant OS (VM)         ← master state machine          │
  │  ├── Mosquitto (LXC, port 1883/9001)                                │
  │  ├── InfluxDB (LXC, port 8086)                                      │
  │  ├── Frigate NVR (Docker, + Coral USB TPU)                          │
  │  ├── Wyoming Voice Pipeline (LXC)                                   │
  │  ├── nginx (LXC)                   ← reverse proxy, internal+public │
  │  ├── EQ Engine (Python agent)                                       │
  │  ├── Env Station (Python agent)                                     │
  │  ├── Audio Receiver (Python agent)                                  │
  │  ├── Home Sensors (Python agent, port 8082)                         │
  │  ├── BerkeleyAlarms (port 8084)    ← alarm actuator                 │
  │  └── BerkeleyMessages (port 8085)  ← AI message inbox               │
  │                                                                     │
  │  Node 02 — Gigabyte GFCANADA (Compute Node) [2.5GbE]               │
  │  ├── Proxmox VE (hypervisor)                                        │
  │  ├── Ollama Server (LXC/VM) + RTX 4080 SUPER                       │
  │  ├── BerkeleyDashboard (port 8090) ← internal + public web          │
  │  ├── Data Correlation Agents (Docker)                               │
  │  └── AI Garden / CrossModal Agents → publish home/messages/#        │
  │                                                                     │
  │  Raspberry Shake RS4D                                               │
  │  └── UDP data stream → Node 01 EQ Engine                            │
  │                                                                     │
  │  Raspberry Pi 5 (Edge / Node 03)                                    │
  │  ├── RTL-SDR (ADS-B + AIS) → BerkeleyTracker / MQTT                 │
  │  ├── External microphones → RTSP → Audio Receiver                  │
  │  └── BirdNET/BatNET local inference → MQTT + Messages              │
  │                                                                     │
  │  Weather Pole (ESP32) + AirGradient ONE sensors                     │
  │  └── MQTT publish → Node 01:1883                                    │
  │                                                                     │
  │  First Alert ZCOMBO-G (Smoke+CO, Z-Wave)                           │
  │  └── Z-Wave → HA → MQTT → home/alerts/smoke/# + co/#               │
  │                                                                     │
  │  5× HLK-LD2410 mmWave Sensors (ESPHome)                            │
  │  └── MQTT publish → Node 01:1883                                    │
  │                                                                     │
  │  PoE IP Cameras (Panoramic / Bullet / Variable-Focal)              │
  │  └── RTSP → Frigate on Node 01                                     │
  │                                                                     │
  │  4K TV                                                              │
  │  └── Chromium kiosk → Internal Dashboard :8090/internal/           │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## Cross-Modal Correlation (Future)

The `CrossModalAI` agent (running on Node 02) will:
1. Subscribe to `home/events/bird-audio` and `home/events/bird-visual`
2. When audio detects "American Robin" and video shows a robin within 30 s on a nearby camera:
   → Create a correlated event in EventStore  
   → Link the audio clip and video clip  
   → Publish a Message: `home/messages/crossmodal/observation`
3. Over time, build a training dataset of (audio, video, species) triples

This is why the EventStore has a `correlated_with` field and why media clips are archived with stable paths.

---

## Dashboard Architecture (Config-Driven)

The dashboard was originally ported from a Hawaii deployment and has been
refactored into a **fully config-driven, modular architecture** that can be
relocated to any geography by changing a single JSON file.

### Configuration System

```
services/dashboard/
├── config/
│   └── default.json           ← ALL hardcoded values live here
│                                 (100+ settings: location, stations,
│                                  buoys, URLs, timings, colors)
├── api-server/
│   ├── src/
│   │   ├── config.ts          ← Typed loader with env var overrides
│   │   ├── lib/
│   │   │   ├── cache.ts       ← Shared cache middleware (replaces 11 copies)
│   │   │   ├── fetcher.ts     ← Shared fetch wrapper (timeout + UA from config)
│   │   │   └── logger.ts      ← Pino logger
│   │   ├── db.ts              ← Vessel + aircraft observation DB (flat JSON)
│   │   └── routes/
│   │       ├── config.ts      ← /api/config (serves config to frontend)
│   │       ├── weather.ts     ← NWS API (reads coords from config)
│   │       ├── buoys.ts       ← NDBC (reads station IDs from config)
│   │       ├── ...            ← All 14 routes are config-driven
│   │       └── health.ts
│   └── package.json
├── frontend/
│   ├── index.html
│   └── public/
│       ├── admin.html         ← Vessel/aircraft image uploader
│       └── static/
│           ├── state.js       ← Shared mutable state (map, layers, liveData)
│           ├── map-setup.js   ← Leaflet init, panes, base tiles
│           ├── geo.js         ← Coastline, bathymetry, distance math
│           ├── render.js      ← Marker builders, DOM helpers, declutter
│           ├── fetch.js       ← All 14 API fetch functions
│           ├── ui-states.js   ← 6 dashboard state definitions
│           ├── engine.js      ← State machine, pagination, transitions
│           ├── main.js        ← Entry point (boot, intervals, FPS)
│           └── style.css      ← With CSS custom properties (:root tokens)
```

### Data Flow

```
config/default.json
    │
    ├──→ config.ts (getConfig()) ──→ All route files read from here
    │                                  (coordinates, station IDs, zones)
    │
    ├──→ cache.ts (withCache())  ──→ All routes use shared cache middleware
    │                                  (TTL per route from config)
    │
    ├──→ fetcher.ts (apiFetch()) ──→ All routes use shared fetch wrapper
    │                                  (timeout + User-Agent from config)
    │
    └──→ /api/config endpoint    ──→ Frontend fetches on boot
                                       (populates CONFIG global)
```

### API Data Sources

All endpoints are unauthenticated public APIs unless noted:

| Source | Endpoint | Config Key | Cache TTL |
|--------|----------|-----------|-----------|
| USGS | `/api/earthquakes` | `location.center` (300km radius) | 5 min |
| ADSB.fi | `/api/aircraft` | `aircraft.center` + `radiusNm` | 1 min |
| NWS | `/api/weather` | `location.center` | 10 min |
| Open-Meteo | `/api/airquality` | `airQualityPoints[]` | 15 min |
| Open-Meteo | `/api/wind` | `windGrid[]` | 30 min |
| NOAA NDBC | `/api/buoys` | `buoys[]` | 5 min |
| NOAA CO-OPS | `/api/tide` | `tideStations[]` | 30 min |
| NWS | `/api/alerts` | `alerts.area` + `zones` | 5 min |
| Open-Meteo Marine | `/api/currents` | `currentPoints[]` | 30 min |
| FAA | `/api/airport` | `airports[].primary` | 2 min |
| NWS | `/api/stations` | `weatherStations[]` | 10 min |
| FAA | `/api/turbulence` | (national, no config) | 10 min |
| Local DB | `/api/ships` | Vessel observation DB | None |

### CSS Design Tokens

All colors are centralized as CSS custom properties in `:root`:

```css
:root {
  --bg-body, --bg-viewport, --bg-panel, --bg-glass
  --text-primary, --text-muted, --text-light, --text-inactive
  --accent-cyan, --accent-blue, --accent-gold, --accent-green
  --hazard-red, --hazard-orange, --hazard-pink, --hazard-purple
}
```

To retheme the dashboard, modify only the `:root` block.

---

## Porting Status

**Completed (2026-08-16):**
- ✅ Node 01 hardware and storage upgrades complete (64GB RAM, 2TB NVMe boot, 1TB SSD data)
- ✅ Node 02 hardware procured (64GB RAM, RTX 4080 SUPER, 3× NVMe drives)
- ✅ Dashboard API server ported to Bay Area coordinates
- ✅ All 14 API routes re-centered, config-driven, using shared cache/fetcher
- ✅ Frontend script.js ported to Bay Area (bounds, buoys, stations, airports, surf spots)
- ✅ Frontend style.css ported (renamed classes, added CSS custom properties)
- ✅ AIS WebSocket streaming removed (ships.ts now reads from local vessel DB)
- ✅ mock.js deleted (was 110KB, 90% duplication of script.js)
- ✅ Dead code removed (unused functions, disabled fetchWind body)
- ✅ Bathymetry generation deduplicated (3 generators → 1 reusable function)
- ✅ Satellite/radar overlay logic deduplicated
- ✅ Memory leak fixed (trafficHistory garbage collection)
- ✅ Polling intervals staggered (prevents thundering herd)
- ✅ Unused npm dependencies pruned (better-sqlite3, drizzle-orm, cookie-parser)
- ✅ CONFIG.md documentation created
- ✅ Automated test suite created (Vitest)
- ✅ Architecture document updated

**To-Do (Hardware/Infra):**
- Proxmox VE 8.x installation on Node 02 (after Windows 11 data migration)
- Transition ship tracking from DB-only to local AIS SDR (Pi 5) → MQTT
- Integrate Google Coral USB TPU on Day 2

**To-Do (Software):**
- Replace remaining hardcoded CSS hex values with var() references
- Frontend config.js bootstrap (fetch /api/config on load, populate CONFIG global)

---

## Decisions Log

- **Storage Separation:** Dedicated the 1TB internal SSD on Node 01 (`local-data` pool) specifically for InfluxDB and Frigate to avoid wear on the boot NVMe and ensure high IOPS.
- **Node 02 Staggered Launch:** Decided to bring Node 02 online *after* Node 01 is fully stable to avoid debugging two complex clustered environments simultaneously.
- **Ship Tracking Architecture:** Dropped the paid AISStream.io WebSocket in favor of local RTL-SDR on a Pi 5 publishing to MQTT. The `/api/ships` route now reads from the local vessel observation DB, which will be populated by MQTT in the future.
- **Network Upgrades:** Upgraded to a 2.5GbE switch for all nodes to accommodate high-bandwidth storage and Proxmox clustered data sync.
- **Memory Optimization:** Both nodes upgraded to 64GB RAM to ensure sufficient overhead for Proxmox ZFS ARC and future container deployments.
- **Config-Driven Architecture:** All hardcoded values extracted to `config/default.json` to enable geographic relocation without code changes. The frontend fetches config from `/api/config` on boot.
- **Shared Infrastructure:** Created `lib/cache.ts` and `lib/fetcher.ts` to replace 11+ copy-pasted cache blocks and duplicated fetch boilerplate across route files.
- **mock.js Deletion:** Deleted the 110KB mock.js (90%+ duplication of script.js). If demo mode is needed, the real script.js handles API-offline graceful degradation natively.
- **CSS Design Tokens:** Extracted all hardcoded colors to CSS custom properties in `:root` to enable easy theming and consistent palette management.
- **Unused Dependencies:** Removed `better-sqlite3`, `drizzle-orm`, and `cookie-parser` from package.json — the app uses a flat JSON file for persistence, not SQLite.
- **Frontend Module Split (Phase 4):** Split the 2110-line script.js into 8 ES modules. Design rationale: `state.js` is the leaf dependency (shared mutable state), `map-setup.js` initializes Leaflet and writes to state, `geo.js`/`render.js`/`fetch.js` are the workhorses, `ui-states.js` defines views, `engine.js` drives transitions, and `main.js` is the entry point. Circular dependencies were resolved by adding `currentView` to `state.js` instead of having render.js import from engine.js.

---

## Deferred Items

- **Frontend Module Split:** Completed — the monolithic 2110-line script.js was split into 8 focused ES modules (state.js, map-setup.js, geo.js, render.js, fetch.js, ui-states.js, engine.js, main.js). Index.html updated to `<script type="module" src="/static/main.js">`. All 134 exports resolve correctly across the module graph. 35 automated tests verify the structure.
- **VisionAgent & CrossModal AI:** Deferred until Node 02 is fully operational and base telemetry is stable. Rationale: Need stable ground-truth data (audio/video) before correlating.
- **Local Ship Tracking via SDR:** Deferred until Pi 5 SDR setup is complete. The `/api/ships` endpoint reads from the vessel DB which will be populated by MQTT messages from the SDR.
- **Touch Command Panel:** Deferred to future phase. Rationale: Prioritizing automated alerts (Alexa TTS, Display) over manual control panels initially.
- **Push Notifications (Pushover/Gotify):** Deferred until internal dashboard and Node 01 networking are finalized.
