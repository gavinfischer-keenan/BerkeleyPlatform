# Mosswood Hardware Inventory
# 11 Mosswood Road, Berkeley CA 94708
# ─────────────────────────────────────────────────────────────────────────────
# This is the authoritative hardware reference for the Berkeley Home
# Intelligence Platform. All agent configs, ESPHome yamls, and MQTT topic
# assignments derive from the IDs and labels defined here.

---

## Compute Nodes

### Node 01 — The Control Plane (Dell OptiPlex SFF)
| Field | Value |
|-------|-------|
| Role | Data Logger, MQTT Broker, InfluxDB, Frigate NVR, Voice Pipeline |
| CPU | Intel Core i7-8700 (6C/12T, 3.2–4.6 GHz) |
| RAM | **64 GB DDR4** (upgraded from 16 GB) |
| Boot Drive | **2 TB M.2 NVMe** (upgraded from 256 GB SSD) |
| Data Drive | **1 TB internal SSD** (Proxmox storage pool `local-data` — InfluxDB + Frigate recordings) |
| GPU | Intel UHD Graphics 630 (QuickSync for Frigate) |
| GPU Accelerator | Google Coral USB TPU (**arriving Day 2 — Frigate uses QuickSync on Day 1**) |
| PSU | 200 W internal |
| UPS | **CyberPower CP1500PFCLCD PFC Sinewave** (USB → NUT for clean shutdown) |
| OS | Proxmox VE 8.x (bare-metal hypervisor) |
| Network | **2.5GbE switch** (Ethernet — hardwired) |
| Form Factor | Small Form Factor (SFF) |
| Hostname | `node01` / `mosswood-ctrl` |

> [!NOTE]
> **Coral USB TPU arrives Day 2 (Monday).** Frigate uses Intel QuickSync on Day 1 only.

**Services running on Node 01:**

| Container/VM | Type | Resources (64GB budget) | Purpose |
|-------------|------|------------------------|---------|
| `haos` | VM | 4 vCPU, 4GB RAM, 32GB disk (NVMe) | Home Assistant OS — Rachio, Alexa, Z-Wave |
| `mosquitto` | LXC | 1 vCPU, 512MB | MQTT Broker |
| `influxdb` | LXC | 2 vCPU, 4GB RAM, 500GB on 1TB data SSD | Time-series DB |
| `frigate` | Docker | 2 vCPU, 6GB RAM, QuickSync → Coral Day 2 | NVR — recordings to data SSD |
| `wyoming` | LXC | 2 vCPU, 2GB RAM | Voice Pipeline (openWakeWord + Faster-Whisper) |
| `nginx` | LXC | 1 vCPU, 512MB | Reverse proxy (internal + public) |
| *overhead* | — | ~6GB | Proxmox host + ZFS ARC |
| *headroom* | — | ~41GB free | Future services |

---

### Node 02 — The Compute Node (Gigabyte GFCANADA)
| Field | Value |
|-------|-------|
| Role | AI Brain, Data Consumer, Deep Batch Analysis, Dashboard + API Server |
| Motherboard | Gigabyte B650 GAMING X AX (AM5, DDR5, 3× M.2, PCIe 5.0) |
| CPU | AMD Ryzen 7 7800X3D (8C/16T, 4.2 GHz, 3D V-Cache) |
| RAM | **64 GB DDR5** (2×32GB — upgraded from 2×16GB) |
| Boot NVMe | Kingston SNV2S2000G 2TB (Proxmox boot — currently Windows 11) |
| AI NVMe | **Samsung 990 Pro 2TB PCIe 4.0 M.2 2280** (AI model buffer) |
| Data NVMe | **Samsung 9100 Pro 2TB PCIe 5.0 x4 M.2 2280** (batch processing) |
| Total Storage | **6 TB NVMe** (3 drives, all M.2 slots populated) |
| GPU | NVIDIA RTX 4080 SUPER (16 GB GDDR6X VRAM) |
| iGPU | AMD Radeon integrated (Proxmox console) |
| UPS | Shared CyberPower CP1500PFCLCD |
| OS | Windows 11 Home → **migrate to Proxmox VE 8.x** (after data migration) |
| Network | **Realtek 2.5GbE** (native on board) + WiFi 6E |
| Hostname | `node02` / `gfcanada` |
| **Timeline** | **Comes online AFTER Node 01 is stable** — pending data migration + hardware upgrades |

**Pre-Proxmox checklist:**
1. Migrate all personal data off current Windows install
2. Swap RAM: remove 2×16GB UD5-6000, install 2×32GB DDR5 kit (standard DIMM)
3. Install Samsung 990 Pro in M.2 slot 2
4. Install Samsung 9100 Pro in M.2 slot 1 (PCIe 5.0)
5. BIOS: Enable IOMMU/SVM, disable Hyper-V, verify 3 NVMe + 64GB detected
6. Wipe Kingston → Install Proxmox VE 8.x
7. Configure GPU passthrough (VFIO/IOMMU for RTX 4080 SUPER)

**Services running on Node 02:**

| Container/VM | Type | Resources (64GB budget) | Storage | Purpose |
|-------------|------|------------------------|---------|--------|
| `ollama` | LXC/VM | 4 vCPU, 16GB, GPU passthrough | Samsung 990 Pro | LLM inference (Llama-3 8B+) |
| `berkeley-dashboard` | Docker | 2 vCPU, 4GB | Kingston boot | Hawaii-ported dashboard + API |
| `correlation-agents` | Docker | 4 vCPU, 8GB | Samsung 9100 Pro | Data correlation batch |
| `ai-garden` | Docker | 2 vCPU, 2GB | Kingston boot | Irrigation AI |
| *overhead* | — | ~8GB | — | Proxmox + GPU driver + ZFS ARC |
| *headroom* | — | ~26GB free | — | Future services |

---

### Edge Node — Raspberry Pi 5
| Field | Value |
|-------|-------|
| Role | Acoustic & RF Edge Processor |
| Placement | High position — upper window, attic, or weatherproof enclosure for SDR line-of-sight over Bay |
| Audio Inputs | 3× USB microphones (local processing — NOT streamed over Wi-Fi) |
| RF Inputs | 2× RTL-SDR USB dongles |
| SDR 1 | AIS marine vessel tracking (156.8 MHz) |
| SDR 2 | ADS-B aircraft tracking (1090 MHz) |
| Processing | BirdNET (species ID), BatNET (bat species), AIS decoder, dump1090 (ADS-B) |
| Output | MQTT only — tiny text events, no raw audio over Wi-Fi |
| Network | Wi-Fi (2.4 GHz or 5 GHz) — MQTT payloads only |
| Hostname | `pi5-edge` |

---

### Microcontrollers — ESP32 / Pi Zero Swarm
All run **ESPHome** firmware, report via MQTT to Node 01's Mosquitto broker.
OTA updates via ESPHome dashboard.

| Unit ID | Hardware | Role | Location |
|---------|----------|------|----------|
| `esp-weather-pole` | ESP32 DevKit | Weather station + MQ gas sensors | Top of outdoor AC-powered pole |
| `esp-leak-01` through `esp-leak-10` | ESP32 / Pi Zero W | Drip/leak sensors | Distributed throughout house |
| `esp-soil-01` through `esp-soil-10` | ESP32 / Pi Zero W | Soil moisture sensors | Garden zones |
| `esp-power-01` through `esp-power-06` | ESP32 + SCT-013 CT clamps | Electrical monitoring | Breaker panel / circuits |
| `esp-mmwave-living` | ESP32 + HLK-LD2410 | mmWave presence | Living room |
| `esp-mmwave-office` | ESP32 + HLK-LD2410 | mmWave presence | Office |
| `esp-mmwave-bed1` | ESP32 + HLK-LD2410 | mmWave presence | Primary bedroom |

---

## Sensors — Complete Inventory

### 1. Seismic — Raspberry Shake (1 unit)
| Field | Value |
|-------|-------|
| Device | Raspberry Shake RBOOM or RS3D |
| MQTT output agent | EarthquakePredictionEngine |
| Topic | `home/sensors/rsam`, `home/alerts/earthquake` |
| Data | RSAM amplitude, P-wave detection, estimated magnitude |

---

### 2. Weather Station (1 unit — outdoor, on pole)
| Field | Value |
|-------|-------|
| Microcontroller | ESP32 (`esp-weather-pole`) |
| Power | 120 V AC at pole base → Mean Well AC-DC → 5 V / 12 V DC rail |
| MQTT topic | `home/sensors/station/weather-pole` |

| Sensor | Parameter | Unit | Field Name |
|--------|-----------|------|------------|
| Temperature | Ambient air temp | °F | `temperature_f` |
| Humidity | Relative humidity | % | `humidity_pct` |
| Wind Speed | Anemometer | mph | `wind_speed_mph` |
| Wind Direction | Vane | degrees (0–359) | `wind_direction_deg` |
| Wind Gust | Peak speed in interval | mph | `wind_gust_mph` |
| Barometric Pressure | Station pressure | hPa | `pressure_hpa` |
| PM2.5 | Fine particulate matter | µg/m³ | `pm25_ugm3` |
| Ozone | O₃ concentration | ppb | `ozone_ppb` |
| UV Index | UV irradiance | index (0–11+) | `uv_index` |
| Rain Rate | Tipping bucket | mm/hr | `rain_rate_mm_hr` |
| Rain Accumulation | Since midnight | mm | `rain_accum_mm` |

---

### 3. Gas Sensors — MQ Series (outdoor pole, AC-powered heaters)
| Field | Value |
|-------|-------|
| Microcontroller | ESP32 (`esp-weather-pole`) shares with weather station |
| Power | 12 V DC rail for heater coils; ESP32 reads analog output |
| MQTT topic root | `home/sensors/gas/weather-pole/{gas_type}` |

| Sensor | Gas Detected | Alert Threshold | MQTT `gas_type` |
|--------|-------------|-----------------|-----------------|
| MQ-2 | LPG, propane, hydrogen, smoke | 1000 ppm | `mq2` |
| MQ-3 | Alcohol, ethanol, benzene | 300 ppm | `mq3` |
| MQ-4 | Methane, natural gas (CH₄) | 1000 ppm | `mq4` |
| MQ-5 | LPG, natural gas | 1000 ppm | `mq5` |
| MQ-6 | LPG, butane, propane | 1000 ppm | `mq6` |
| MQ-7 | Carbon monoxide (CO) | 50 ppm | `mq7` |
| MQ-8 | Hydrogen (H₂) | 1000 ppm | `mq8` |
| MQ-9 | CO, flammable gas (LPG) | 200 ppm | `mq9` |
| MQ-135 | NH₃, benzene, CO₂-proxy, smoke | 400 ppm | `mq135` |

Gas payload per sensor:
```json
{
  "sensor": "mq7",
  "gas": "carbon_monoxide",
  "raw_mv": 1450,
  "ppm": 48.2,
  "threshold_ppm": 50,
  "alarm": false,
  "timestamp": 1705350000000
}
```

---

### 4. Microphones (3 units)
| Field | Value |
|-------|-------|
| Processing | On Pi 5 locally — BirdNET + BatNET |
| Output | MQTT events only (no audio streams over Wi-Fi) |
| MQTT topics | `home/events/bird-audio`, `home/events/bat-audio` |
| MQTT messages topic | `home/messages/birdnet/summary`, `home/messages/batnet/summary` |

| Mic ID | Location |
|--------|----------|
| `mic-front-porch` | Front porch / garden facing |
| `mic-rear-garden` | Rear garden, near bird feeders |
| `mic-side-yard` | Side yard |

---

### 5. Cameras (5 units — wired)
| Field | Value |
|-------|-------|
| Processing | Frigate NVR on Node 01 (Intel QuickSync + Google Coral TPU) |
| Output | Frigate MQTT events → Home Assistant |
| MQTT topics | `home/events/person-detected`, `home/events/animal-detected` |

| Cam ID | Location | Coverage |
|--------|----------|----------|
| `cam-front-gate` | Front gate / street | Entry counting, departure verification |
| `cam-front-door` | Front door | Person detection, package detection |
| `cam-rear-garden` | Rear garden | Wildlife, bird feeder, soil zone coverage |
| `cam-side-yard` | Side yard | Perimeter |
| `cam-driveway` | Driveway | Vehicle detection |

---

### 6. Electrical Monitoring (5–6 units)
| Field | Value |
|-------|-------|
| Hardware | ESP32 + SCT-013 split-core CT clamps |
| MQTT topic | `home/sensors/house/power/{circuit_id}` |
| Alert topic | `home/alerts/breaker/{circuit_id}`, `home/alerts/power/{circuit_id}` |

| Circuit ID | Label | Location |
|------------|-------|----------|
| `main-panel` | Main Panel Total | Service entry |
| `hvac` | HVAC / Heat Pump | Utility area |
| `kitchen` | Kitchen Circuits | Kitchen |
| `garage-shop` | Garage / Workshop | Garage |
| `outdoor-pole` | Weather Pole AC Feed | Exterior pole |
| `general-house` | General House Load | Main panel |

Circuit payload:
```json
{
  "circuit_id": "hvac",
  "circuit_name": "HVAC / Heat Pump",
  "watts": 3200,
  "voltage_v": 119.8,
  "amps": 26.7,
  "kwh_today": 14.2,
  "breaker_tripped": false,
  "timestamp": 1705350000000
}
```

---

### 7. Drip / Leak Sensors (10 units)
| Field | Value |
|-------|-------|
| Hardware | ESP32 or Pi Zero W + resistive water sensor |
| MQTT topic | `home/sensors/house/leak/{sensor_id}` |
| Alert topic | `home/alerts/leak/{sensor_id}` |

| Sensor ID | Location |
|-----------|----------|
| `leak-kitchen-sink` | Under kitchen sink |
| `leak-kitchen-dishwasher` | Dishwasher base |
| `leak-bath1-toilet` | Bathroom 1 toilet base |
| `leak-bath1-sink` | Bathroom 1 under sink |
| `leak-bath2-toilet` | Bathroom 2 toilet base |
| `leak-bath2-sink` | Bathroom 2 under sink |
| `leak-bath3-sink` | Bathroom 3 under sink |
| `leak-water-heater` | Water heater pan |
| `leak-washing-machine` | Laundry pan |
| `leak-utility-room` | Utility / mechanical room floor |

---

### 8. Soil Moisture Sensors (10 units)
| Field | Value |
|-------|-------|
| Hardware | ESP32 / Pi Zero W + capacitive soil sensor (avoid resistive — they corrode) |
| MQTT topic | `home/sensors/house/soil/{zone_id}` |
| Rachio zone mapping | Zone ID → Rachio zone number (configured in `.env`) |

| Zone ID | Garden Location | Rachio Zone |
|---------|----------------|-------------|
| `soil-zone-1` | Front slope, upper terrace | zone_1 |
| `soil-zone-2` | Front slope, lower terrace | zone_2 |
| `soil-zone-3` | Side yard left border | zone_3 |
| `soil-zone-4` | Side yard right border | zone_4 |
| `soil-zone-5` | Rear garden, upper bed | zone_5 |
| `soil-zone-6` | Rear garden, lower bed | zone_6 |
| `soil-zone-7` | Rear garden, drip line A | zone_7 |
| `soil-zone-8` | Rear garden, drip line B | zone_8 |
| `soil-zone-9` | Retaining wall planting | zone_9 |
| `soil-zone-10` | Container / potted bed | zone_10 |

---

### 9. Rachio Irrigation Controller (1 unit)
| Field | Value |
|-------|-------|
| Integration | Home Assistant Rachio integration (Node 02) |
| Control topics | `home/commands/rachio/{zone}` |
| Soil moisture → Rachio | Automated via Home Assistant automation |
| Zone mapping | See soil sensors table above |

---

### 10. mmWave Presence Sensors (3 units)
| Field | Value |
|-------|-------|
| Hardware | HLK-LD2410 24 GHz radar + ESP32 (ESPHome) |
| Capability | Detects micro-movement including breathing — no false "empty" when sleeping |
| MQTT topic | `home/sensors/house/occupancy/{room_id}` |

| Sensor ID | Room ID | Location |
|-----------|---------|----------|
| `esp-mmwave-living` | `living-room` | Main living room seating area |
| `esp-mmwave-office` | `office` | Desk area |
| `esp-mmwave-bed1` | `bedroom-primary` | Primary bedroom |

**Occupancy State Machine (Home Assistant):**
- `Occupied` — any mmWave = true OR phone Wi-Fi connected
- `Garden` — mmWave = false + camera garden zone = person + Wi-Fi connected
- `Deep Sleep` — mmWave bedroom = true + time 22:00–07:00
- `Departed` — explicit voice/button command OR (all mmWave = false + Wi-Fi disconnected + cameras clear 15 min)
- `Vacant Deep Compute` — Departed state → Node 02 full AI mode

**Departure Command:**
```
Voice: "We are leaving" / "House, we are leaving"
Result: Home Assistant confirms via front gate camera, then sets Departed state
MQTT:  home/events/occupancy-state {"state": "departed", "method": "voice_command", ...}
```

---

### 11. SDR — AIS Marine Tracking (1 unit on Pi 5)
| Topic | `home/sensors/ais/{mmsi}` — vessel positions |
| Format | Standard AIS parsed JSON: `{mmsi, name, lat, lon, speed_kn, heading_deg, ship_type}` |

### 12. SDR — ADS-B Aircraft Tracking (1 unit on Pi 5)
| Topic | `home/sensors/adsb/{icao}` — aircraft positions |
| Format | `{icao, callsign, lat, lon, altitude_ft, speed_kt, heading_deg, aircraft_type}` |

---

## Network Topology Summary

```
Internet
    │
    ▼
ISP Router / Firewall
    │
    ▼
┌─ 2.5GbE Switch ──────────────────────────────────────────────────────┐
│  (all nodes hardwired — purchased)                                    │
│                                                                       │
│  ┌── CyberPower CP1500PFCLCD UPS (USB → NUT on Node 01) ──────┐     │
│  │   Protects: Node 01, Node 02, Switch, Pi 5                  │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                       │
│  [Ethernet]── Node 01 (Dell OptiPlex, 64GB DDR4, 2TB+1TB)
│                  └── Mosquitto MQTT Broker  ◄─── ALL sensors report here
│                  └── InfluxDB (500GB on 1TB data SSD)
│                  └── Frigate NVR ◄──── 5 Wired Cameras (+ Coral Day 2)
│                  └── Home Assistant OS (VM)
│                  └── nginx (internal + public vhosts)
│
│  [Ethernet]── Node 02 (GFCANADA, 64GB DDR5, 6TB NVMe, RTX 4080S)
│                  └── Ollama / AI Stack (Docker, GPU passthrough)
│                  └── BerkeleyDashboard (ported Hawaii dashboard)
│                  └── Correlation Agents + AI Garden
│                  └── (COMES ONLINE AFTER NODE 01 STABLE)
    │
    └──[Wi-Fi]──── Pi 5 Edge (positioned high for SDR LOS)
    │                  └── 3 USB Microphones (local BirdNET/BatNET)
    │                  └── SDR 1: AIS
    │                  └── SDR 2: ADS-B
    │                  └── MQTT output only (tiny text payloads)
    │
    └──[Wi-Fi]──── ESP32 Swarm (ESPHome → MQTT)
                       ├── esp-weather-pole (weather + MQ gas, AC powered)
                       ├── esp-leak-01 … esp-leak-10
                       ├── esp-soil-01 … esp-soil-10
                       ├── esp-power-01 … esp-power-06
                       └── esp-mmwave-living / office / bed1
```

### Wi-Fi Load Management
- All ESP32 sensors transmit MQTT (tiny JSON, change-on-delta only)
- Audio: processed locally on Pi 5 — zero raw audio over Wi-Fi
- Video: wired directly to Node 01 — zero video over Wi-Fi
- Result: Wi-Fi carries only telemetry text, well within capacity

---

## Power Notes
- **UPS:** CyberPower CP1500PFCLCD PFC Sinewave — USB connected to Node 01 → NUT daemon for orderly shutdown
- **Weather pole**: 120 V AC at base → Mean Well 12 V + 5 V DC DIN-rail PSU
  - 12 V rail: MQ sensor heater coils (~150 mA each × 9 sensors = ~1.35 A)
  - 5 V rail: ESP32 + weather station instruments
  - No battery concerns — continuous power, no solar dependency

---

## Deferred Hardware Upgrades

| Item | Current State | Target | Trigger |
|------|--------------|--------|--------|
| Node 01 storage expansion | 1TB data SSD | Add 4TB surveillance HDD | If recordings + InfluxDB fill 1TB |
| Node 02 RAM expansion | 64GB DDR5 (2×32GB) | 128GB DDR5 (2×64GB) | If larger LLMs needed (70B+ params) |
| Display | None | Dedicated always-on TV/monitor | After dashboard fully ported |
| AirGradient ONE | Not purchased | Indoor CO2/PM2.5 sensor | After system stable |
