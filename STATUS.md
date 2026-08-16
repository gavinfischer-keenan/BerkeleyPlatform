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

### Software — Backend Architecture Overhaul (2026-08-16)
- [x] `config/default.json` — All 100+ hardcoded values extracted to single config file
- [x] `config.ts` — Typed config loader with env var overrides
- [x] `routes/config.ts` — `/api/config` endpoint (frontend fetches on boot)
- [x] `lib/cache.ts` — Shared cache middleware (replaces 11 copy-pasted blocks)
- [x] `lib/fetcher.ts` — Shared fetch wrapper (timeout + User-Agent from config)
- [x] All 14 route files refactored to use config + cache + fetcher
- [x] AIS WebSocket streaming removed from `ships.ts` (vessel DB retained for future MQTT)
- [x] Standardized error handling (all routes return 502 on upstream failure)
- [x] Pruned unused npm dependencies (`better-sqlite3`, `drizzle-orm`, `cookie-parser`)
- [x] `admin.html` updated from "Hawaii Telemetry" to "Mosswood Command Center"

### Software — Frontend Cleanup (2026-08-16)
- [x] Full port of script.js to Bay Area (bounds, buoys, stations, airports, surf spots)
- [x] Full port of style.css (renamed classes, added CSS custom properties)
- [x] `mock.js` deleted (110KB, 90%+ duplication of script.js)
- [x] All ship/AIS code removed from script.js (~200 lines)
- [x] Dead code removed (fetchWind body, unused polygon functions)
- [x] Bathymetry generation deduplicated (3 generators → 1 reusable function)
- [x] Satellite/radar overlay logic deduplicated
- [x] `trafficHistory` memory leak fixed (added garbage collection)
- [x] Polling intervals staggered (prevents thundering herd)
- [x] CSS design tokens added (`:root` custom properties for all colors)

### Documentation (2026-08-16)
- [x] `CONFIG.md` — Comprehensive config reference with all keys documented
- [x] `ARCHITECTURE.md` — Updated with config-driven architecture, data flow, decisions
- [x] `STATUS.md` — Updated with all completed work
- [x] Implementation plan created, approved, and executed

### Testing (2026-08-16)
- [x] Vitest test framework installed
- [x] Automated tests for config loader, cache middleware, fetch wrapper
- [x] Automated tests for key API routes

### Repository
- [x] All changes committed and pushed to GitHub

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

- [x] Complete frontend porting (script.js — 100+ location changes)
- [ ] Generate Bay Area GeoJSON (replace hawaii.geojson)
- [ ] Build and test API server on Node 02
- [x] Rewrite `ships.ts` to read from local DB (MQTT integration deferred)
- [ ] Configure nginx reverse proxy (internal + public vhosts)
- [ ] Deploy dashboard Docker container on Node 02
- [ ] Set up InfluxDB buckets and retention policies
- [ ] Configure Mosquitto MQTT broker
- [ ] Deploy Home Assistant OS VM
- [ ] Deploy Wyoming Voice Pipeline
- [ ] Deploy Frigate NVR
- [ ] Split script.js into ES modules (config.js, map.js, geo.js, etc.)
- [ ] Frontend config.js bootstrap (fetch /api/config on load)

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
