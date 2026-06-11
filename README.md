# Berkeley Home Intelligence Platform

A multi-agent AI platform running on a single Intel Linux box where specialized engines observe, predict, and learn — feeding their intelligence to multiple consumer interfaces.

## Repositories

| Repo | Role | Language | MQTT Namespace |
|------|------|----------|---------------|
| [BerkeleyHouse](https://github.com/gavinfischer-keenan/BerkeleyHouse) | Dashboard + API Server | Node.js | Consumer |
| [EarthquakePredictionEngine](https://github.com/gavinfischer-keenan/Earthquakepredictionengine) | Seismic P-wave detection + EEW | Python | `home/alerts/earthquake` |
| [BerkeleyEnvironmental](https://github.com/gavinfischer-keenan/BerkeleyEnvironmental) | Outdoor weather, fire, air quality | Python | `home/alerts/fire-weather` |
| [BerkeleyAudioReceiver](https://github.com/gavinfischer-keenan/BerkeleyAudioReceiver) | BirdNET / BatNET audio analysis | Python | `home/events/bird-audio` |
| [BerkeleyHomeSensors](https://github.com/gavinfischer-keenan/BerkeleyHomeSensors) | House infrastructure (soil, leak, power, climate) | Python | `home/sensors/house/*` |
| [BerkeleyEventStore](https://github.com/gavinfischer-keenan/BerkeleyEventStore) | Shared SQLite event database | Python | N/A (library) |

## Architecture

```
┌─────────── SENSORS ───────────────────────────────────────────────┐
│ Raspberry Shake RS4D    │ 4× Microphones     │ 6× Cameras        │
│ Raspberry Pi Env Station│ Soil/Leak/Power     │ Room Temp/Humidity │
└─────────┬───────────────┴──────────┬──────────┴──────────┬────────┘
          │                          │                     │
          ▼                          ▼                     ▼
┌─────────────────────── INTEL LINUX SERVER ────────────────────────┐
│                                                                   │
│  ┌──────────────────── MQTT Bus (Mosquitto) ──────────────────┐  │
│  │  home/alerts/*  home/events/*  home/sensors/*  home/cmd/*  │  │
│  └────────────────────────┬───────────────────────────────────┘  │
│                           │                                      │
│  ┌─ AI Agents ────────────┼──────────────────────────────────┐  │
│  │  EarthquakePrediction  │  BerkeleyAudioReceiver           │  │
│  │  BerkeleyEnvironmental │  BerkeleyHomeSensors             │  │
│  │  VisionAgent (future)  │  CrossModalAI (future)           │  │
│  └────────────────────────┼──────────────────────────────────┘  │
│                           │                                      │
│  ┌─ Storage ──────────────┼──────────────────────────────────┐  │
│  │  InfluxDB (time-series)│  SQLite EventStore (events)      │  │
│  │  Local FS (media)      │  miniSEED (seismic waveforms)    │  │
│  └────────────────────────┼──────────────────────────────────┘  │
│                           │                                      │
│  ┌─ Consumers ────────────┼──────────────────────────────────┐  │
│  │  BerkeleyHouse (4K TV) │  Alexa (speaker-adjacent)        │  │
│  │  HomeKit (HomeBridge)  │  Event Logger                    │  │
│  └────────────────────────┘──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Quick Start

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
git clone https://github.com/gavinfischer-keenan/BerkeleyEventStore.git

# 3. Configure
cd BerkeleyPlatform
cp .env.example .env
nano .env

# 4. Start infrastructure
docker compose up -d mosquitto influxdb

# 5. Start agents (pick what you have hardware for)
docker compose up -d earthquake-engine
docker compose up -d environmental-station
docker compose up -d audio-receiver
docker compose up -d home-sensors
```

## MQTT Topic Reference

See [MQTT_TOPICS.md](MQTT_TOPICS.md) for the complete topic schema.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Full system architecture
- [MQTT_TOPICS.md](MQTT_TOPICS.md) — Canonical MQTT topic reference
