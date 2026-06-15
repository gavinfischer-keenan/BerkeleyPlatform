# MQTT Topic Schema — Berkeley Home Intelligence Platform

All agents publish and subscribe using this canonical topic schema.
Consumers subscribe with wildcards (e.g., `home/alerts/#`).

## Topic Tree

```
home/
├── alerts/                           ← Urgent, time-critical (QoS 1, NOT retained)
│   ├── earthquake                    ← EQ engine: magnitude, countdown, severity
│   ├── fire-weather                  ← envstation: Diablo wind, pre-hydration trigger
│   ├── air-quality                   ← envstation: PM2.5/AQI threshold exceeded
│   ├── soil-saturation               ← envstation: slope instability risk
│   ├── heavy-rain                    ← envstation: atmospheric river detection
│   ├── leak                          ← homesensors: CRITICAL water detected
│   ├── power-anomaly                 ← homesensors: overcurrent, voltage issue
│   ├── audio                         ← audio-receiver: unusual audio event
│   └── intrusion                     ← vision-agent: unknown person (future)
│
├── status/                           ← Agent heartbeats (QoS 0, retained)
│   ├── earthquake-engine             ← {status, uptime_s, rsam, triggers, version}
│   ├── environmental-station         ← {status, station_last_seen, influx_ok, version}
│   ├── audio-receiver                ← {status, active_nodes, detections_total}
│   │   ├── front-porch              ← per-node: {status, detail}
│   │   ├── shed
│   │   └── ...
│   ├── home-sensors                  ← {status, sensor_count, last_reading}
│   ├── voice-pipeline                ← {status, wake_word_ok, whisper_ok, version}
│   ├── ollama                        ← {status, node, models_loaded, gpu_util_pct, version}
│   ├── vision-agent                  ← {status, active_cameras, fps} (future)
│   └── cross-modal                   ← {status, events_correlated} (future)
│
├── events/                           ← Confirmed detections (QoS 1, NOT retained)
│   ├── earthquake                    ← Confirmed seismic: {magnitude, duration, pga}
│   ├── bird-audio                    ← BirdNET: {species, confidence, node_id, clip_ref}
│   ├── bat-audio                     ← BatNET: {species, confidence, node_id}
│   ├── bird-visual                   ← YOLO: {species, confidence, camera_id, bbox} (future)
│   ├── person-detected               ← YOLO: {person_id, camera_id, bbox} (future)
│   ├── animal-detected               ← YOLO: {species, camera_id, bbox} (future)
│   ├── correlated                    ← Cross-modal: {audio_event_id, video_event_id} (future)
│   └── garden-behavior               ← Ecology AI: {species, behavior, evidence[]} (future)
│
├── sensors/                          ← Continuous telemetry (QoS 0, NOT retained)
│   ├── station/{station_id}          ← Pi → envstation: full StationReading batch
│   ├── rsam                          ← EQ engine: real-time seismic amplitude
│   ├── audio-levels/{node_id}        ← audio-receiver: per-mic dB levels
│   ├── camera-motion/{cam_id}        ← vision-agent: motion score (future)
│   └── house/                        ← BerkeleyHomeSensors
│       ├── soil/{zone_id}            ← {moisture_pct, raw_mv, soil_temp_c}
│       ├── leak/{sensor_id}          ← {wet, flow_gpm, pressure_psi}
│       ├── power/{circuit_id}        ← {watts, voltage, amps, kwh_today}
│       ├── climate/{room_id}         ← {temp_f, humidity_pct, pressure_hpa}
│       └── occupancy/{room_id}       ← {occupied, presence_confidence, sensor_id}
│                                         ← HLK-LD2410 mmWave (ESPHome → MQTT)
│
└── commands/                         ← Outbound actions (QoS 1, NOT retained)
    ├── display                       ← Override dashboard: {command, severity, message}
    ├── alexa-say                     ← Alexa TTS: {text, alarm_id, severity}
    ├── speaker-play                  ← Play audio file: {file}
    ├── homekit-scene                 ← Activate HomeKit scene: {scene}
    ├── rachio/{zone}                 ← Irrigation: {action, duration_min}
    ├── compute-node                  ← Wake/sleep Node 02: {action, reason, requestor}
    ├── alarm/ack                     ← User ACK: {alarm_id}  (from UI / future mobile)
    └── camera/{cam_id}              ← PTZ control: {pan, tilt, zoom} (future)

alarms/                               ← Alarm state (QoS 0, retained)
    └── active                        ← BerkeleyAlarms: {alarms[], count}
```

## QoS and Retention Rules

| Category | QoS | Retained | Rationale |
|----------|-----|----------|-----------|
| `alerts/` | 1 | No | Must arrive, but shouldn't persist after handling |
| `status/` | 0 | **Yes** | New subscribers see current agent state immediately |
| `events/` | 1 | No | Must arrive, historical lookup via EventStore |
| `sensors/` | 0 | No | High frequency, latest value only matters |
| `commands/` | 1 | No | Must arrive, one-shot execution |

## Payload Conventions

All payloads are JSON. Common fields:

```json
{
  "timestamp": 1705350000000,
  "agent": "earthquake-engine",
  "version": "0.1.0"
}
```

### Alert Payload
```json
{
  "alert_id": "eq-2024-abc",
  "alert_type": "earthquake",
  "severity": "critical",
  "title": "EARTHQUAKE EXPECTED",
  "message": "Magnitude 3.2 estimated. S-wave arrival in 2.5 seconds.",
  "data": { "magnitude": 3.2, "distance_km": 15, "s_wave_eta_sec": 2.5 },
  "timestamp": 1705350000000
}
```

### Event Payload
```json
{
  "event_id": "bird-2024-xyz",
  "node_id": "front-porch",
  "analyzer": "birdnet",
  "species": "Turdus migratorius",
  "common_name": "American Robin",
  "confidence": 0.92,
  "start_time": 3.0,
  "end_time": 6.2,
  "location": { "name": "Front Porch", "lat": 37.8751, "lng": -122.2697 },
  "timestamp": 1705350000000
}
```

### Occupancy Payload (HLK-LD2410 mmWave)
```json
{
  "sensor_id": "hlk-living-room",
  "room_id": "living-room",
  "occupied": true,
  "presence_confidence": 0.97,
  "motion_energy": 42,
  "still_energy": 18,
  "timestamp": 1705350000000
}
```

### Compute Node Command Payload
```json
{
  "action": "wake",
  "reason": "vacancy_detected",
  "requestor": "home-sensors",
  "timestamp": 1705350000000
}
```

## Agent Registration

Every agent MUST:
1. Set MQTT LWT to publish `{"status": "offline"}` to its `home/status/{name}` topic (retained)
2. On start: publish `{"status": "online", "version": "..."}` to same topic (retained)
3. On graceful shutdown: publish `{"status": "offline"}` (retained)
4. Heartbeat every 60s to same topic with current metrics
