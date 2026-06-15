# Berkeley Home Intelligence Platform

A multi-agent AI platform running across a two-node high-availability architecture where specialized
engines observe, predict, and learn — feeding their intelligence to multiple consumer interfaces.

## Node Map

| Node | Hardware | Role | Key Services |
|------|----------|------|-------------|
| **Node 01 — Control Plane** | Dell OptiPlex SFF (i7-8700) | Stable, un-crashable heart. All hardware interfaces, MQTT, life-safety, voice, vision. | Home Assistant OS, Mosquitto, InfluxDB, Frigate NVR (+ Coral TPU), Wyoming Voice Pipeline |
| **Node 02 — Compute Node** | Gigabyte GFCANADA (Ryzen 7 7800X3D + RTX 4080 SUPER) | "Brain in a Jar." Wakes on API request or vacancy for deep AI work. | Ollama (Llama-3, LLaVA), Data Correlation Agents, Mosswood Intelligence Briefing |
| **Edge Swarm (Node 03)** | Raspberry Pi 5, ESP32s, HLK-LD2410 × 5 | Field sensors and local inference. | BirdNET/BatNET, ADS-B/AIS SDR, mmWave occupancy, Weather Pole |

## Repositories

| Repo | Role | Language | MQTT Namespace |
|------|------|----------|----------------|
| [BerkeleyHouse](https://github.com/gavinfischer-keenan/BerkeleyHouse) | Dashboard + API Server | Node.js | Consumer |
| [EarthquakePredictionEngine](https://github.com/gavinfischer-keenan/Earthquakepredictionengine) | Seismic P-wave detection + EEW | Python | `home/alerts/earthquake` |
| [BerkeleyEnvironmental](https://github.com/gavinfischer-keenan/BerkeleyEnvironmental) | Outdoor weather, fire, air quality | Python | `home/alerts/fire-weather` |
| [BerkeleyAudioReceiver](https://github.com/gavinfischer-keenan/BerkeleyAudioReceiver) | BirdNET / BatNET audio analysis | Python | `home/events/bird-audio` |
| [BerkeleyHomeSensors](https://github.com/gavinfischer-keenan/BerkeleyHomeSensors) | House infrastructure (soil, leak, power, climate, occupancy) | Python | `home/sensors/house/*` |
| [BerkeleyTracker](https://github.com/gavinfischer-keenan/BerkeleyTracker) | ADS-B + AIS aircraft & vessel tracking via SDR | Python | `home/events/tracker/*` |
| [BerkeleyEventStore](https://github.com/gavinfischer-keenan/BerkeleyEventStore) | Shared SQLite event database | Python | N/A (library) |

## Architecture

```
┌─────────────────────── EDGE SWARM (Node 03) ──────────────────────────┐
│ Raspberry Pi 5 (BirdNET/ADS-B/AIS) │ Weather Pole (ESP32/MQ Gas)      │
│ 5× HLK-LD2410 mmWave Occupancy     │ PoE IP Cameras (Frigate feed)    │
└──────────────┬────────────────────────────────────────────────────────-┘
               │  MQTT / RTSP / UDP
               ▼
┌──────────────────── NODE 01 — CONTROL PLANE ──────────────────────────┐
│ Dell OptiPlex SFF (i7-8700) │ Proxmox VE                              │
│                                                                        │
│  Home Assistant OS (VM) ← master state machine                        │
│                                                                        │
│  ┌──────────────────── MQTT Bus (Mosquitto) ───────────────────────┐  │
│  │  home/alerts/*  home/events/*  home/sensors/*  home/commands/*  │  │
│  └──────────────────────────┬────────────────────────────────────--┘  │
│                             │                                          │
│  ┌─ AI Agents (Python) ─────┼────────────────────────────────────┐   │
│  │  EarthquakePrediction    │  BerkeleyAudioReceiver             │   │
│  │  BerkeleyEnvironmental   │  BerkeleyHomeSensors               │   │
│  │  BerkeleyTracker (SDR)   │  VisionAgent/Frigate (future)      │   │
│  └──────────────────────────┼────────────────────────────────────┘   │
│                             │                                          │
│  ┌─ Storage ────────────────┼────────────────────────────────────┐   │
│  │  InfluxDB (4 TB HDD)     │  SQLite EventStore (events.db)    │   │
│  │  Local FS /data/audio    │  miniSEED (seismic waveforms)     │   │
│  │  Local FS /data/video    │                                    │   │
│  └──────────────────────────┼────────────────────────────────────┘   │
│                             │                                          │
│  ┌─ Consumers ──────────────┼────────────────────────────────────┐   │
│  │  BerkeleyHouse (4K TV)   │  Alexa TTS                        │   │
│  │  HomeKit (HomeBridge)    │  Wyoming Voice Pipeline            │   │
│  └──────────────────────────┘────────────────────────────────────┘   │
└───────────────────────────────┬───────────────────────────────────────┘
                                │  REST API (vacancy / deep-compute)
                                ▼
┌──────────────────── NODE 02 — COMPUTE NODE ───────────────────────────┐
│ Gigabyte GFCANADA (Ryzen 7 7800X3D + RTX 4080 SUPER) │ Proxmox VE    │
│                                                                        │
│  Ollama Server (Llama-3 / LLaVA on RTX 4080)                         │
│  Data Correlation Agents (DeepLabCut, Spectrogram, E-Nose RF)        │
│  Mosswood Intelligence Briefing Dashboard                             │
└───────────────────────────────────────────────────────────────────────┘
```

## Quick Start

> **Note:** The production deployment runs Proxmox VE on both nodes. The `docker-compose.yml`
> in this repo describes the logical service layout and can be used for local development or
> as a bare-Docker fallback. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full Proxmox LXC/VM layout.

```bash
# 1. Clone this meta-repo
git clone https://github.com/gavinfischer-keenan/BerkeleyPlatform.git
cd BerkeleyPlatform

# 2. Clone all service repos (alongside this directory)
cd ..
git clone https://github.com/gavinfischer-keenan/EarthquakePredictionEngine.git
git clone https://github.com/gavinfischer-keenan/BerkeleyEnvironmental.git
git clone https://github.com/gavinfischer-keenan/BerkeleyAudioReceiver.git
git clone https://github.com/gavinfischer-keenan/BerkeleyHomeSensors.git
git clone https://github.com/gavinfischer-keenan/BerkeleyTracker.git
git clone https://github.com/gavinfischer-keenan/BerkeleyEventStore.git

# 3. Configure
cd BerkeleyPlatform
cp .env.example .env
nano .env   # set NODE01_IP, NODE02_IP, InfluxDB token, etc.

# 4. Start infrastructure (on Node 01)
docker compose up -d mosquitto influxdb

# 5. Start agents (pick what you have hardware for)
docker compose up -d earthquake-engine
docker compose up -d environmental-station
docker compose up -d audio-receiver
docker compose up -d home-sensors
docker compose up -d tracker

# 6. Start Frigate NVR (Node 01, requires Coral USB TPU)
docker compose up -d frigate

# 7. Start Ollama (on Node 02 separately)
# docker compose -f docker-compose.node02.yml up -d ollama
```

## MQTT Topic Reference

See [MQTT_TOPICS.md](MQTT_TOPICS.md) for the complete topic schema.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Full system architecture and node topology
- [MQTT_TOPICS.md](MQTT_TOPICS.md) — Canonical MQTT topic reference
