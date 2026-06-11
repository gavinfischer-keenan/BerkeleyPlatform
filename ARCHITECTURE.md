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

## Layers

### 1. Sensor Layer (hardware → data)

| Source | Transport | Frequency |
|--------|-----------|-----------|
| Raspberry Shake RS4D | UDP → EQ Engine | 100 Hz continuous |
| Pi Environmental Station | MQTT | 30s intervals |
| RTSP Microphones (×4–6) | TCP/RTSP → Audio Receiver | 15s chunks |
| Cameras (×6, future) | RTSP → Frigate | 30 FPS continuous |
| Soil probes (ESP32) | WiFi → MQTT | 5 min intervals |
| Leak sensors | Zigbee → Zigbee2MQTT → MQTT | On change |
| CT clamps (power) | WiFi → MQTT | 10s intervals |
| Room temp sensors | Zigbee → MQTT | 60s intervals |
| Rachio irrigation | REST API polling | 5 min intervals |

### 2. Agent Layer (data → intelligence)

Each agent:
- Subscribes to its domain topics on MQTT
- Runs analysis / ML models
- Publishes events and alerts to MQTT
- Stores data in InfluxDB (time-series) or EventStore (tagged events)
- Implements the standard lifecycle (LWT, online/offline, heartbeat)

| Agent | Domain | Storage | Alert Priority |
|-------|--------|---------|---------------|
| EarthquakePredictionEngine | Seismic | miniSEED files | CRITICAL (seconds) |
| BerkeleyEnvironmental | Weather/fire | InfluxDB | HIGH (minutes) |
| BerkeleyAudioReceiver | Birds/bats | WAV archive + EventStore | LOW (informational) |
| BerkeleyHomeSensors | House infra | InfluxDB | CRITICAL (leak) |
| VisionAgent (future) | Cameras | Video clips + EventStore | MEDIUM |
| CrossModalAI (future) | Multi-modal | EventStore correlations | LOW |

### 3. Storage Layer (persistence)

```
InfluxDB 2.7
├── sensors-raw     (30 days)   ← environmental station readings
├── house-raw       (30 days)   ← soil, leak, power, climate
├── house-hourly    (1 year)    ← downsampled aggregates
└── house-daily     (forever)   ← daily summaries for ML

SQLite (EventStore)
└── events.db                   ← tagged events from all agents

Local Filesystem
├── /data/audio/                ← archived WAV/FLAC clips
├── /data/seismic/              ← miniSEED waveform files
└── /data/video/                ← archived video clips (future)
```

### 4. Consumer Layer (intelligence → humans)

| Consumer | Interface | Connection |
|----------|-----------|-----------|
| BerkeleyHouse Dashboard | 4K TV | MQTT → WebSocket bridge |
| Alexa | Voice | MQTT → `home/commands/alexa-say` |
| HomeKit (HomeBridge) | iPhone/Apple Watch | MQTT → HomeBridge plugin |
| Event Logger | Disk | Subscribe `home/events/#` |

## Cross-Modal Correlation (Future)

The `CrossModalAI` agent will:
1. Subscribe to `home/events/bird-audio` and `home/events/bird-visual`
2. When audio detects "American Robin" and video shows a robin within 30s on a nearby camera:
   → Create a correlated event in EventStore
   → Link the audio clip and video clip
3. Over time, build a training dataset of (audio, video, species) triples
4. Feed a model that learns the "speech" of local birds

This is why the EventStore has a `correlated_with` field and why media clips are archived with stable paths.

## Network Topology

```
  Internet
     │
  [Router]
     │
  ┌──┴──────── Local LAN (192.168.1.x) ─────────────────────┐
  │                                                           │
  │  Intel Linux Server (.100)                                │
  │  ├── Mosquitto (1883)                                     │
  │  ├── InfluxDB (8086)                                      │
  │  ├── EQ Engine (subprocess, no port)                      │
  │  ├── Env Station (subprocess, no port)                    │
  │  ├── Audio Receiver (subprocess, no port)                 │
  │  ├── Home Sensors (8082)                                  │
  │  └── Dashboard (5050)                                     │
  │                                                           │
  │  Raspberry Shake RS4D (.164)                              │
  │  ├── UDP data stream                                      │
  │                                                           │
  │  Pi Environmental Station (.TBD)                          │
  │  ├── MQTT publish to .100:1883                            │
  │                                                           │
  │  RTSP Microphones (.101–.106)                             │
  │  ├── RTSP streams                                         │
  │                                                           │
  │  ESP32 Soil Probes (.110–.115)                            │
  │  ├── MQTT publish to .100:1883                            │
  │                                                           │
  │  Zigbee2MQTT Hub (.120)                                   │
  │  ├── Leak sensors, room temp → MQTT                       │
  │                                                           │
  │  4K TV (.200)                                             │
  │  └── Chromium kiosk → Dashboard :5050                     │
  └───────────────────────────────────────────────────────────┘
```
