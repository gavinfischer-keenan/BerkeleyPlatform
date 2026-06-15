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

## Deployment Topology

### Node 01 — The Control Plane (Dell OptiPlex SFF)

**Role:** The stable, un-crashable heart of the property. Handles all hardware interfaces,
MQTT messaging, life-safety logic, and low-latency voice/vision processing.

**Hardware:** Intel Core i7-8700 | 32 GB DDR4 RAM | 256 GB SSD (boot) | 4 TB Surveillance HDD | Google Coral USB TPU

**Hypervisor:** Proxmox VE

| VM / LXC | Type | Purpose |
|----------|------|---------|
| Home Assistant OS | VM | Master state machine — integrates Rachio, Alexa, Weather APIs; executes all automation logic |
| Mosquitto | LXC | Central MQTT broker for all edge IoT sensors |
| InfluxDB | LXC | High-speed time-series logging (seismic, electrical, gas telemetry) to 4 TB HDD |
| Frigate NVR | Docker | 24/7 video ingestion; uses Google Coral USB TPU for efficient frame detection |
| Wyoming Voice Pipeline | LXC | openWakeWord + Faster-Whisper; translates network microphone audio to text for Home Assistant |

---

### Node 02 — The Compute Node (Gigabyte GFCANADA)

**Role:** The "Brain in a Jar." Wakes on API requests from Node 01 (or when the property is
vacant) to run deep-dive data correlation, biological behavioural analysis, and large language models.

**Hardware:** AMD Ryzen 7 7800X3D | NVIDIA RTX 4080 SUPER 16 GB | 64 GB DDR5 RAM | 2 TB NVMe (boot) | 1 TB Gen 4 NVMe (AI model buffer)

**Hypervisor:** Proxmox VE

| VM / LXC | Type | Purpose |
|----------|------|---------|
| Ollama Server | LXC/VM | Serves Llama-3 (text/logic) and LLaVA (vision/contextual) models on the RTX 4080; 1 TB NVMe for fast model loading |
| Data Correlation Agents | Docker | Custom Python batch agents: Tail Kinematics (DeepLabCut), Spectrogram clustering, Electronic Nose Random Forest classifier |
| Mosswood Intelligence Briefing | LXC | Hosts the asynchronous AI analysis dashboard UI |

**Inter-node API:** Node 01 triggers Node 02 via a REST wake call when vacancy is detected
(mmWave occupancy sensors clear) or when Node 01 AI agents request deep-compute resources.

---

### Node 03 / Edge Swarm

| Device | Role |
|--------|------|
| Raspberry Pi 5 | Hardwired to SDRs (ADS-B / AIS); runs BirdNET/BatNET locally; streams audio via RTSP |
| Weather Pole (ESP32 + DIN-Rail PSU) | MQ gas sensor suite, temperature, humidity, wind |
| 5× HLK-LD2410 mmWave Radars (ESPHome) | Absolute interior occupancy (breathing-level detection); triggers Deep Compute mode on Node 02 |
| PoE IP Camera Array | Panoramic overwatch, fixed bullet, variable-focal targeted |

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
| Leak sensors | Zigbee → Zigbee2MQTT → MQTT | On change |
| CT clamps (power) | WiFi → MQTT | 10 s intervals |
| Room temp sensors | Zigbee → MQTT | 60 s intervals |
| Rachio irrigation | REST API polling (via HASS) | 5 min intervals |
| ADS-B / AIS SDR | USB → Pi 5 → BerkeleyTracker | Continuous |

### 2. Agent Layer (data → intelligence)

Each agent:
- Subscribes to its domain topics on MQTT
- Runs analysis / ML models
- Publishes events and alerts to MQTT
- Stores data in InfluxDB (time-series) or EventStore (tagged events)
- Implements the standard lifecycle (LWT, online/offline, heartbeat)

| Agent | Node | Domain | Storage | Alert Priority |
|-------|------|--------|---------|----------------|
| EarthquakePredictionEngine | 01 | Seismic | miniSEED files | CRITICAL (seconds) |
| BerkeleyEnvironmental | 01 | Weather/fire | InfluxDB | HIGH (minutes) |
| BerkeleyAudioReceiver | 01/Pi5 | Birds/bats | WAV archive + EventStore | LOW (informational) |
| BerkeleyHomeSensors | 01 | House infra | InfluxDB | CRITICAL (leak) |
| BerkeleyTracker | Pi5 | ADS-B + AIS | InfluxDB + EventStore | LOW (informational) |
| VisionAgent (future) | 01 | Cameras (Frigate) | Video clips + EventStore | MEDIUM |
| CrossModalAI (future) | 02 | Multi-modal | EventStore correlations | LOW |
| Data Correlation Agents | 02 | Batch AI | EventStore | LOW (async) |

### 3. Storage Layer (persistence)

```
Node 01 — InfluxDB 2.7 (4 TB HDD)
├── sensors-raw     (30 days)   ← environmental station readings
├── house-raw       (30 days)   ← soil, leak, power, climate, occupancy
├── house-hourly    (1 year)    ← downsampled aggregates
└── house-daily     (forever)   ← daily summaries for ML

Node 01 — SQLite (EventStore)
└── events.db                   ← tagged events from all agents

Node 01 — Local Filesystem
├── /data/audio/                ← archived WAV/FLAC clips
├── /data/seismic/              ← miniSEED waveform files
└── /data/video/                ← archived video clips (Frigate)

Node 02 — Local Filesystem (1 TB Gen 4 NVMe)
└── /models/                    ← Ollama model cache (Llama-3, LLaVA)
```

### 4. Consumer Layer (intelligence → humans)

| Consumer | Node | Interface | Connection |
|----------|------|-----------|-----------|
| BerkeleyHouse Dashboard | 01 | 4K TV | MQTT → WebSocket bridge |
| Mosswood Intelligence Briefing | 02 | Browser | Async AI analysis UI |
| Home Assistant | 01 | iPhone / Apple Watch / Alexa | HASS automations + MQTT |
| Alexa TTS | 01 | Voice | MQTT → `home/commands/alexa-say` |
| HomeKit (HomeBridge) | 01 | iPhone / Apple Watch | MQTT → HomeBridge plugin |
| Event Logger | 01 | Disk | Subscribe `home/events/#` |

---

## Cross-Modal Correlation (Future)

The `CrossModalAI` agent (running on Node 02) will:
1. Subscribe to `home/events/bird-audio` and `home/events/bird-visual`
2. When audio detects "American Robin" and video shows a robin within 30 s on a nearby camera:
   → Create a correlated event in EventStore
   → Link the audio clip and video clip
3. Over time, build a training dataset of (audio, video, species) triples
4. Feed a model that learns the "speech" of local birds

This is why the EventStore has a `correlated_with` field and why media clips are archived with stable paths.

---

## Network Topology

```
  Internet
     │
  [Router]
     │
  ┌──┴──────── Local LAN (192.168.1.x / TBD) ──────────────────────────┐
  │                                                                      │
  │  Node 01 — Dell OptiPlex (Control Plane) [NODE01_IP]                │
  │  ├── Proxmox VE (hypervisor)                                         │
  │  ├── Home Assistant OS (VM)         ← master state machine           │
  │  ├── Mosquitto (LXC, port 1883/9001)                                 │
  │  ├── InfluxDB (LXC, port 8086)                                       │
  │  ├── Frigate NVR (Docker, + Coral USB TPU)                           │
  │  ├── Wyoming Voice Pipeline (LXC)                                    │
  │  ├── EQ Engine (Python agent)                                        │
  │  ├── Env Station (Python agent)                                      │
  │  ├── Audio Receiver (Python agent)                                   │
  │  ├── Home Sensors (Python agent, port 8082)                          │
  │  └── BerkeleyHouse Dashboard (port 5050)                             │
  │                                                                      │
  │  Node 02 — Gigabyte GFCANADA (Compute Node) [NODE02_IP]             │
  │  ├── Proxmox VE (hypervisor)                                         │
  │  ├── Ollama Server (LXC/VM) + RTX 4080 SUPER                        │
  │  ├── Data Correlation Agents (Docker)                                │
  │  └── Mosswood Intelligence Briefing Dashboard                        │
  │                                                                      │
  │  Raspberry Shake RS4D (.164)                                         │
  │  ├── UDP data stream → Node 01 EQ Engine                             │
  │                                                                      │
  │  Raspberry Pi 5 (Edge / Node 03)                                     │
  │  ├── RTL-SDR (ADS-B + AIS) → BerkeleyTracker                        │
  │  ├── External microphones → RTSP → Audio Receiver                   │
  │  └── BirdNET/BatNET local inference                                  │
  │                                                                      │
  │  Weather Pole (ESP32 + DIN-Rail PSU)                                 │
  │  ├── MQTT publish → Node 01:1883                                     │
  │                                                                      │
  │  5× HLK-LD2410 mmWave Sensors (ESPHome)                             │
  │  ├── MQTT publish → Node 01:1883                                     │
  │                                                                      │
  │  PoE IP Cameras (Panoramic / Bullet / Variable-Focal)               │
  │  ├── RTSP → Frigate on Node 01                                       │
  │                                                                      │
  │  Zigbee2MQTT Hub                                                     │
  │  ├── Leak sensors, room temp → MQTT                                  │
  │                                                                      │
  │  4K TV                                                               │
  │  └── Chromium kiosk → BerkeleyHouse Dashboard :5050                 │
  └──────────────────────────────────────────────────────────────────────┘
```
