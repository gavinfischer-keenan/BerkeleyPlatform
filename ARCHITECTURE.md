# Berkeley Home Intelligence Platform — System Architecture

## Design Philosophy

**Multiple specialized agents, one shared bus.** Each agent is a standalone Python service
that owns one sensor domain. Agents communicate exclusively through MQTT (Mosquitto).
No agent calls another directly — reducing coupling to zero.

```
"The architecture has to support the streaming of the audio — the capturing
of events that have occurred... the audio and the video will need to be stored
for analysis both in realtime and as stored events when tagged."
```

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

## Deployment Topology

### Node 01 — The Control Plane (Dell OptiPlex SFF)

**Role:** The stable, un-crashable heart of the property. Handles all hardware interfaces,
MQTT messaging, life-safety logic, and low-latency voice/vision processing.

**Hardware:** Intel Core i7-8700 | 32 GB DDR4 RAM | 256 GB SSD (boot) | 4 TB Surveillance HDD | Google Coral USB TPU

**Hypervisor:** Proxmox VE

| VM / LXC | Type | Purpose |
|----------|------|---------|
| Home Assistant OS | VM | Master state machine — integrates Rachio, Alexa, Z-Wave, Zigbee, Weather APIs |
| Mosquitto | LXC | Central MQTT broker for all edge IoT sensors |
| InfluxDB | LXC | High-speed time-series logging (seismic, electrical, gas telemetry) to 4 TB HDD |
| Frigate NVR | Docker | 24/7 video ingestion; uses Google Coral USB TPU for efficient frame detection |
| Wyoming Voice Pipeline | LXC | openWakeWord + Faster-Whisper; translates network microphone audio to text for HA |
| **nginx** | **LXC** | **Reverse proxy — routes internal vs public-facing web traffic** |

---

### Node 02 — The Compute Node (Gigabyte GFCANADA)

**Role:** The "Brain in a Jar." Wakes on API requests from Node 01 (or when the property is
vacant) to run deep-dive data correlation, biological behavioural analysis, and large language models.

**Hardware:** AMD Ryzen 7 7800X3D | NVIDIA RTX 4080 SUPER 16 GB | 64 GB DDR5 RAM | 2 TB NVMe (boot) | 1 TB Gen 4 NVMe (AI model buffer)

**Hypervisor:** Proxmox VE

| VM / LXC | Type | Purpose |
|----------|------|---------|
| Ollama Server | LXC/VM | Serves Llama-3 (text/logic) and LLaVA (vision/contextual) models on the RTX 4080 |
| Data Correlation Agents | Docker | Custom Python batch agents: Tail Kinematics, Spectrogram clustering, Electronic Nose RF classifier |
| AI Garden Agent | Docker | Irrigation optimization, plant health analysis → publishes `home/messages/ai-garden/#` |
| CrossModal AI | Docker | Correlates audio + video + seismic events; publishes messages + structured events |

**Inter-node API:** Node 01 triggers Node 02 via a REST wake call when vacancy is detected
(mmWave occupancy sensors clear) or when Node 01 AI agents request deep-compute resources.

---

### Node 03 / Edge Swarm

| Device | Role |
|--------|------|
| Raspberry Pi 5 | Hardwired to SDRs (ADS-B / AIS); runs BirdNET/BatNET locally; streams audio via RTSP |
| Weather Pole (ESP32 + DIN-Rail PSU) | MQ gas sensor suite, temperature, humidity, wind |
| 5× HLK-LD2410 mmWave Radars (ESPHome) | Absolute interior occupancy (breathing-level detection) |
| PoE IP Camera Array | Panoramic overwatch, fixed bullet, variable-focal targeted |
| Z-Wave USB Stick (Zooz ZST39 LR) | Gateway for First Alert ZCOMBO-G smoke/CO detectors |

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
| ADS-B / AIS SDR | USB → Pi 5 → BerkeleyTracker | Continuous |

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
Node 01 — InfluxDB 2.7 (4 TB HDD)
├── sensors-raw     (30 days)   ← environmental station readings
├── house-raw       (30 days)   ← soil, leak, power, climate, occupancy
├── house-hourly    (1 year)    ← downsampled aggregates
└── house-daily     (forever)   ← daily summaries for ML

Node 01 — SQLite (EventStore)
└── events.db                   ← tagged events from all agents

Node 01 — SQLite (AlarmStore)
└── alarms.db                   ← alarm history (resolved alarms archive)

Node 01 — SQLite (MessageStore)
└── messages.db                 ← AI agent message inbox (read/unread/archived)

Node 01 — Local Filesystem
├── /data/audio/                ← archived WAV/FLAC clips
├── /data/seismic/              ← miniSEED waveform files
└── /data/video/                ← archived video clips (Frigate)

Node 02 — Local Filesystem (1 TB Gen 4 NVMe)
└── /models/                    ← Ollama model cache (Llama-3, LLaVA)
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
| **Internal Dashboard** | **01** | **`home.mosswood.internal:8090`** | **Household (LAN/VPN)** | **House data, alarms, messages, garden, cameras** |
| **Public Site** | **01** | **`mosswood.science` (public DNS)** | **Anyone** | **Seismograph, env, BirdNET, weather** |
| Alarm Console | 01 | port 8084 | Household | Active alarm management |
| Mosswood Intelligence Briefing | 02 | Node 02 browser | Household | Deep AI analysis |
| Home Assistant | 01 | iPhone/Apple Watch/Alexa | Household | Automations + device control |

#### Two-Dashboard Architecture

```
nginx (Node 01 LXC)
 │
 ├─ internal vhost: home.mosswood.internal
 │    ├── / ──────────────────────→ BerkeleyDashboard :8090 /internal/*
 │    │   (LAN-only bind / VPN required from internet)
 │    └── All paths → full data access
 │
 └─ public vhost: mosswood.science (public IP)
      ├── / ──────────────────────→ BerkeleyDashboard :8090 /public/*
      └── Only /api/public/* paths forwarded (scoped, no house data)

BerkeleyDashboard (port 8090 — single FastAPI app)
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

## Network Topology

```
  Internet
     │
  [Router / Firewall]
     │  ├── Port 80/443 → nginx public vhost → /public/* only
     │
  ┌──┴──────── Local LAN (192.168.1.x / TBD) ──────────────────────────┐
  │                                                                     │
  │  Node 01 — Dell OptiPlex (Control Plane) [NODE01_IP]               │
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
  │  ├── BerkeleyMessages (port 8085)  ← AI message inbox               │
  │  └── BerkeleyDashboard (port 8090) ← internal + public web          │
  │                                                                     │
  │  Node 02 — Gigabyte GFCANADA (Compute Node) [NODE02_IP]            │
  │  ├── Proxmox VE (hypervisor)                                        │
  │  ├── Ollama Server (LXC/VM) + RTX 4080 SUPER                       │
  │  ├── Data Correlation Agents (Docker)                               │
  │  └── AI Garden / CrossModal Agents → publish home/messages/#        │
  │                                                                     │
  │  Raspberry Shake RS4D (.164)                                        │
  │  └── UDP data stream → Node 01 EQ Engine                            │
  │                                                                     │
  │  Raspberry Pi 5 (Edge / Node 03)                                    │
  │  ├── RTL-SDR (ADS-B + AIS) → BerkeleyTracker                       │
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
