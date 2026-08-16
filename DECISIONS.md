# Mosswood Platform — Decisions Log

All architectural, hardware, and software decisions made during the porting of the Hawaii Command Center to the Berkeley Home Intelligence Platform.

**Last Updated:** 2026-08-16

---

## Hardware Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| H1 | **Node 01 RAM: 64GB DDR4** (not 16GB or 32GB) | User upgraded Dell OptiPlex to 64GB before launch. Allows generous VM allocation with 41GB headroom for ZFS ARC. | 2026-08-15 |
| H2 | **Node 01 Boot: 2TB M.2 NVMe** (not 256GB SSD) | User replaced original 256GB SSD with 2TB NVMe for ample Proxmox root space. | 2026-08-15 |
| H3 | **Node 01 Data: 1TB internal SSD** | Added as dedicated Proxmox storage pool (`local-data`) for InfluxDB time-series and Frigate recordings. Separates I/O from boot drive. | 2026-08-15 |
| H4 | **No external 4TB HDD at launch** | Dell SFF has limited bays. 1TB SSD is sufficient for initial deployment. 4TB HDD is a deferred upgrade if storage fills. | 2026-08-15 |
| H5 | **Coral USB TPU arrives Day 2** | Hardware shipping delayed 1 day. Frigate uses Intel QuickSync (i7-8700 UHD 630) on Day 1 — functional but higher CPU load. Config swap is trivial. | 2026-08-15 |
| H6 | **Node 02 RAM: 64GB DDR5 (2×32GB)** | User chose 2×32GB DDR5 over 4×32GB (128GB) due to cost. 2-DIMM config is more stable on AM5 at high speeds. Leaves 2 slots free for future 128GB with 2×64GB sticks. | 2026-08-15 |
| H7 | **Node 02 Storage: 3× 2TB NVMe = 6TB** | Kingston (boot) + Samsung 990 Pro (AI models) + Samsung 9100 Pro (batch data). All 3 M.2 slots populated. PCIe 5.0 slot used for 9100 Pro. | 2026-08-15 |
| H8 | **Node 02 delayed launch** | User needs to migrate data off Windows, swap RAM, install NVMe drives. Node 01 and edge devices operate independently. | 2026-08-15 |
| H9 | **UPS: CyberPower CP1500PFCLCD** | PFC sinewave output (clean power for PSUs). USB data cable to Node 01 for NUT integration — orderly shutdown on battery low. | 2026-08-15 |
| H10 | **2.5GbE switch** | Node 02 has native 2.5GbE (Realtek on B650 board). Upgrade from 1GbE for Node 01↔02 transfers (Frigate clips, batch data). | 2026-08-15 |
| H11 | **HAOS on Node 01** (not Node 02) | Life-safety belongs on the stable control plane. HAOS controls smoke/CO detectors, leak sensors, and Alexa — must not be impacted by GPU crashes or AI experiments. | 2026-08-15 |

---

## Software / Architecture Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| S1 | **Ship tracking: Local AIS SDR only** (AISStream.io removed) | AISStream requires a paid API key and is a cloud dependency. Pi 5 + RTL-SDR provides direct AIS reception at 156.8 MHz. Data flows via MQTT `home/sensors/ais/{mmsi}`. | 2026-08-15 |
| S2 | **WMS ocean overlays: Disabled for v1** | Hawaii used PacIOOS (Oahu SWAN wave model, ROMS current model). No equivalent free WMS for NorCal coast. GEBCO bathymetry + IEM NEXRAD radar are the replacement overlays. | 2026-08-15 |
| S3 | **Air quality: Open-Meteo (keyless)** | No API key needed. Global coverage. Returns US AQI, PM2.5, PM10, ozone per lat/lng. 7 Bay Area monitoring points defined. | 2026-08-15 |
| S4 | **Seismic: Raspberry Shake local Seedlink** | RS4D/RBOOM already online at `rs.local`. API connects to local Seedlink endpoint. USGS remains as supplemental source for regional context. | 2026-08-15 |
| S5 | **Dashboard code placed in `services/dashboard/`** in BerkeleyPlatform repo | Natural home alongside other services (mosquitto, systemd). Separates API server (`api-server/`) from frontend (`frontend/`). | 2026-08-15 |
| S6 | **Backend API fully ported to Bay Area** | All 12 route files re-centered: coordinates, station IDs, timezone (America/Los_Angeles), User-Agent (MosswoodCommandCenter/1.0). | 2026-08-15 |
| S7 | **Frontend porting deferred** | script.js is 120KB with 100+ Hawaii-specific locations. Backend was ported first because it's structured (separate files per route). Frontend requires careful coordinated changes across a single monolithic file. | 2026-08-15 |
| S8 | **Airport: SFO + OAK** (not just HNL) | Bay Area has two major airports. Dashboard queries both and reports worst status. | 2026-08-15 |
| S9 | **NWS Alerts: CA + CAZ508** (not HI + PH) | CA covers state-level alerts. CAZ508 covers SF Bay Shoreline specifically. Additional zones (CAZ506, CAZ510, CAZ511) available for future granularity. | 2026-08-15 |
| S10 | **Wind fallback: W/NW Pacific onshore flow** | Hawaii had ENE trade winds at 16kt as fallback. Bay Area typical pattern is WNW onshore flow at ~12kt with afternoon acceleration through the Golden Gate. | 2026-08-15 |
| S11 | **Dashboard runs on Node 02** | Compute-heavy for map rendering + API aggregation. Node 01 stays focused on life-safety, MQTT, and recordings. | 2026-08-15 |
| S12 | **Domain: mosswood.science** (pending registration) | Public-facing site for seismograph data, BirdNET sightings, environmental data. Internal dashboard at home.mosswood.internal. | 2026-08-15 |

---

## Geographic Decisions

| # | Decision | Value |
|---|----------|-------|
| G1 | **Map center** | 37.88°N, -122.26°W (11 Mosswood Road, Berkeley) |
| G2 | **Map bounds (wide view)** | South: 37.45 (Dumbarton Bridge), North: 38.20 (Suisun Marsh), West: -123.10 (Farallon Islands), East: -121.80 (Suisun Marsh) |
| G3 | **Earthquake search radius** | 300km from center (was 500km for Hawaii — Bay Area is seismically richer) |
| G4 | **Aircraft search radius** | 150nm from center (was 250nm — Bay Area airspace is denser, fewer false positives needed) |
| G5 | **Timezone** | `America/Los_Angeles` (was `Pacific/Honolulu`) |
| G6 | **NWS Forecast Office** | MTR (San Francisco Bay Area) |
