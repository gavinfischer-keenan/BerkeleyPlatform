# Mosswood Platform — Project Status

**Last Updated:** 2026-08-16
**Next Milestone:** Day 1 Launch (Node 01 + Edge — Tomorrow)

---

## ✅ Completed

### Hardware
- [x] Node 01 (Dell OptiPlex) upgraded: 64GB DDR4, 2TB M.2 NVMe, 1TB internal SSD
- [x] Node 02 hardware ordered: 2×32GB DDR5, Samsung 990 Pro 2TB, Samsung 9100 Pro 2TB
- [x] UPS purchased: CyberPower CP1500PFCLCD PFC Sinewave
- [x] 2.5GbE switch purchased
- [x] Coral USB TPU ordered (arriving Monday / Day 2)
- [x] Raspberry Shake verified online at `rs.local`

### Software — Backend API (12/12 routes ported)
- [x] `earthquakes.ts` — USGS, 37.88/-122.26, 300km radius
- [x] `aircraft.ts` — ADSB.fi, 37.88/-122.26, 150nm
- [x] `weather.ts` — NWS, Berkeley coordinates
- [x] `airquality.ts` — Open-Meteo, 7 Bay Area points
- [x] `wind.ts` — Open-Meteo, 12-point Bay Area grid
- [x] `buoys.ts` — NDBC: 46026, 46012, 46013, 46214, 46237, FTPC1
- [x] `tide.ts` — NOAA CO-OPS: SF, Alameda, Richmond, Pt Reyes, Monterey
- [x] `alerts.ts` — NWS zones CA + CAZ508
- [x] `currents.ts` — Open-Meteo Marine, 6 offshore points
- [x] `airport.ts` — FAA status SFO + OAK (worst-of-two)
- [x] `stations.ts` — NWS weather: OAK, SFO, NUQ, CCR, APC, SUU, HWD
- [x] `turbulence.ts` — Location-agnostic (no changes needed)

### Documentation
- [x] Implementation plan created and approved
- [x] Hardware inventory (HARDWARE.md) updated with confirmed specs
- [x] Bay Area data sources reference document created
- [x] Node 02 hardware scan completed (motherboard, RAM, drives, GPU)
- [x] Decisions log (DECISIONS.md) created
- [x] This status document (STATUS.md) created

### Repository
- [x] Hawaii repo cloned
- [x] BerkeleyPlatform repo cloned
- [x] Ported dashboard code placed in `services/dashboard/` in BerkeleyPlatform

---

## 🔄 In Progress

### Software — Frontend (script.js + style.css)
- [ ] Map bounds: `[[20.994, -158.45], [21.75, -157.00]]` → Bay Area bounds
- [ ] PacIOOS WMS layers → GEBCO bathymetry + IEM NEXRAD radar
- [ ] Island polygons (Kauai, Oahu, Molokai, Maui, Hawaii) → Bay Area landmarks
- [ ] Bathymetry/surf grid bounds → Bay Area coordinates
- [ ] Surf spot labels (Pipeline, Waikiki) → Bay Area spots (Mavericks, Ocean Beach)
- [ ] Earthquake place-name filtering → Hayward/Calaveras fault labels
- [ ] Timezone: Pacific/Honolulu → America/Los_Angeles
- [ ] Hawaii IATA codes → Bay Area IATA codes (SFO, OAK, SJC, etc.)
- [ ] uiStates array (6 dashboard views) → Bay Area titles and zoom levels
- [ ] CSS: Waikiki zoom overrides, HNL status box IDs → Bay Area equivalents
- [ ] hawaii.geojson → Bay Area GeoJSON
- [ ] Distance calculations (Honolulu-centered) → Berkeley-centered

### Architecture Documentation
- [ ] ARCHITECTURE.md comprehensive rewrite (in progress)

---

## 📋 To Do — Hardware (Day 1: Tomorrow)

- [ ] Place UPS, plug in, connect USB to Node 01
- [ ] Set up 2.5GbE switch, connect Node 01 + Pi 5 + Shake
- [ ] Boot Node 01 from Proxmox USB installer
- [ ] Install Proxmox VE 8.x on 2TB NVMe
- [ ] Configure 1TB SSD as `local-data` storage pool
- [ ] Install NUT (UPS monitoring daemon)
- [ ] Create all LXC/VM containers per plan
- [ ] Register domain `mosswood.science`
- [ ] Configure router port forwarding (80/443 → nginx)

## 📋 To Do — Hardware (Day 2: Monday)

- [ ] Plug in Coral USB TPU to Node 01
- [ ] Verify with `lsusb | grep Google`
- [ ] Pass through to Frigate container
- [ ] Update Frigate config to use EdgeTPU detector

## 📋 To Do — Software (Post-Node 01 Online)

- [ ] Complete frontend porting (script.js — 100+ location changes)
- [ ] Generate Bay Area GeoJSON (replace hawaii.geojson)
- [ ] Build and test API server on Node 02
- [ ] Rewrite `ships.ts` to consume MQTT instead of AISStream WebSocket
- [ ] Configure nginx reverse proxy (internal + public vhosts)
- [ ] Deploy dashboard Docker container on Node 02
- [ ] Set up InfluxDB buckets and retention policies
- [ ] Configure Mosquitto MQTT broker
- [ ] Deploy Home Assistant OS VM
- [ ] Deploy Wyoming Voice Pipeline
- [ ] Deploy Frigate NVR

## 📋 To Do — Node 02 Bring-Up (After Node 01 Stable)

- [ ] Migrate all personal data off Windows
- [ ] Swap RAM: 2×16GB → 2×32GB DDR5
- [ ] Install Samsung 990 Pro in M.2 slot 2
- [ ] Install Samsung 9100 Pro in M.2 slot 1 (PCIe 5.0)
- [ ] BIOS: IOMMU/SVM, verify all hardware
- [ ] Wipe → Install Proxmox VE 8.x
- [ ] Configure GPU passthrough for RTX 4080 SUPER
- [ ] Deploy Ollama with Llama-3 8B
- [ ] Deploy dashboard Docker container
- [ ] Deploy correlation agents
- [ ] Deploy AI garden agent

## 📋 To Do — Edge Devices

- [ ] Configure Pi 5 with BirdNET, BatNET, AIS SDR, ADS-B SDR
- [ ] Flash ESP32 devices with ESPHome firmware
- [ ] Mount mmWave sensors in target rooms
- [ ] Install leak sensors at all 10 locations
- [ ] Install soil moisture probes in 10 garden zones
- [ ] Install CT clamp power monitoring on breaker panel
- [ ] Mount cameras (5 locations)
- [ ] Set up weather pole with MQ gas sensors

---

## 🔮 Deferred / Future

| Item | Status | Trigger |
|------|--------|---------|
| Node 01 → 4TB HDD | Not purchased | If 1TB data SSD fills |
| Node 02 → 128GB RAM | Not planned yet | If 70B+ LLM models needed |
| Always-on display | Not purchased | After dashboard fully ported |
| AirGradient ONE sensor | Not purchased | After system stable |
| WMS ocean model overlays | Disabled | No free NorCal equivalent to PacIOOS |
| CrossModal AI agent | Stub | After all sensors producing data |
| Public mosswood.science site | Planned | After dashboard working internally |
