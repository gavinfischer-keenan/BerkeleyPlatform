# Mosswood Platform — Project Status

**Last Updated:** 2026-08-16
**Next Milestone:** Node 01 bring-up (Node 02 is already done)

---

## 🔴 Read this before building Node 01

**Node 02 was built first, on 2026-08-16.** The original plan had it come second; a
separate project ([ttoneedmarket](https://github.com/gavinfischer-keenan/ttoneedmarket))
was assigned the same physical machine and needed it now. Node 02 runs standalone and
nothing on it waits for Node 01. Full as-built record: **[NODE02.md](NODE02.md)**.

Five things found during that build that **change what you do on Node 01**:

1. **`services/mosquitto/mosquitto.conf` would not start.** `keepalive_interval` is a
   bridge-only directive and mosquitto rejects it at global scope with
   `Error: Invalid bridge configuration`. **Fixed in this commit** — pull before you
   deploy the broker, or Node 01's MQTT bus will not come up.
2. **The LAN is `192.168.4.0/22`, gateway `192.168.4.1`** — not `192.168.1.x/24`.
   Every reference in this repo was wrong, including the ESPHome netmasks
   (`255.255.252.0`, not `255.255.255.0`). **Fixed in this commit.** Reflash any ESP32
   already programmed from the old files.
3. **`BerkeleyDashboard` cannot authenticate to MQTT — worked around, not fixed.**
   Its `Settings` has no username or password field, and Node 01's broker correctly
   answers `Connection Refused: not authorised` to an anonymous client. Confirmed
   live against `192.168.4.181:1883`.

   **Current state:** Node 02's Mosquitto is configured as an authenticated **bridge**
   to Node 01 (`/etc/mosquitto/conf.d/bridge-node01.conf` in CT 103, mode 600, using
   the `node02` account). It mirrors `home/#` down and pushes `node02/#` up. The
   dashboard keeps talking to its local anonymous listener and now receives real house
   data — verified end to end: a message published on Node 01 arrives at an anonymous
   subscriber on Node 02, and the dashboard logs `mqtt_bridge.connected subscribed=home/#`.

   **Still worth doing properly:** any *other* Python agent deployed from this repo
   has the same gap. `MQTT_USERNAME` / `MQTT_PASSWORD` now exist in `.env.example`
   (they never did before, despite `mosquitto.conf` naming them), so agents can be
   pointed straight at Node 01. `BerkeleyDashboard` itself still needs those two
   fields adding to `dashboard/config.py` if you ever want it to connect directly.
4. **Address map** — `.175`–`.183` is dense, check before assigning:

   | Address | Host |
   | --- | --- |
   | `192.168.4.175` | **Node 02** — Proxmox host |
   | `.176` `.177` | tto-db, tto-app |
   | `.178` `.179` `.180` | ingress (Caddy), ollama, berkeley-dash |
   | **`192.168.4.181`** | **Node 01** — Dell OptiPlex, Proxmox host |
   | `.183` | mosquitto (Node 02 local broker) |

   `.182` is the only gap left in that run. Node 01's own containers should go
   somewhere clear — `.190`–`.199` is empty.
5. **`BerkeleyDashboard` crash-loops without a broker.** `mqtt_bridge.start()` calls
   `paho.connect()` synchronously and dies on `gaierror`. Any agent you deploy on
   Node 01 before the broker exists will do the same.

### Node 01 memory upgrade — done 2026-08-17

Now **32 GB** (2 × 16 GB DDR4-2400, DIMM1/DIMM2). Two slots free, board maximum
64 GB. Everything came back on its own: all five containers, the HA VM, and the
Coral, which Frigate reacquired after one automatic retry.

Two faults the reboot exposed, both fixed, both worth knowing about:

- **The host came back on `192.168.100.2` with no LAN and no internet.** Its
  `192.168.4.181` address had only ever been set at runtime and was never in
  `/etc/network/interfaces`, so the reboot reverted it to the Proxmox installer
  default — including gateway `192.168.100.1`, which does not exist. Now
  persisted properly. **A router DHCP reservation does not protect against this**;
  the host is static and never asks for a lease.
- **The clock was four months behind and the RTC read 2022.** The timezone had
  also reverted to `America/Adak`. Fixed and written back to hardware, but a
  dying CMOS battery is the likely cause — see below.

- [ ] **Replace the CR2032 CMOS battery in Node 01.** It is an eight-year-old
      OptiPlex. Left alone it will lose its clock on every power cycle, which
      breaks TLS, apt and any correlation between node logs.
- [ ] **Raise Node 01 container ceilings.** They were sized for 16 GB.

### Node 02 hardware — what is actually installed

| | Planned | Actual |
|---|---|---|
| RAM | 64GB (2×32) | **32GB (2×16)** — kit never installed, 2 slots free |
| NVMe | 3× 2TB | **1× 2TB** (990 Pro, and it is the boot disk) |
| Storage design | ZFS `fast` + `bulk` | **LVM-thin** — single disk, no pools possible |
| Proxmox | 8.x | **9.2.10** (Debian 13) |
| NIC | 2.5GbE | RTL8125 **negotiating 1Gb** |

The Day-2 RAM swap and the 9100 Pro / Kingston installs were never done. If you have
those parts, fitting them is still worthwhile — Node 02 is memory-ceilinged at 25GB of
container allocations against 30GB usable.

---

## ✅ Completed

### Node 02 — built 2026-08-16
- [x] Proxmox VE 9.2.10 on the 990 Pro, enterprise repos swapped for no-subscription
- [x] `vmbr1` isolated service mesh (`10.20.0.0/24`, no uplink)
- [x] NVIDIA 595.80 on the host, DKMS, shared into unprivileged LXC (verified)
- [x] PostgreSQL 17 + pgvector 0.8 — TTO schema applied, all 12 migrations
- [x] Ollama with `mxbai-embed-large` + `llama3.1:8b`, 120 tok/s on the 4080
- [x] BerkeleyDashboard serving `/internal/` and `/public/` on :8090
- [x] Caddy ingress, Proxmox firewall (`policy_in: DROP`, LAN → 22/8006/80 only)
- [x] Seagate 7.3TB reformatted ext4 as `bulk`; nightly vzdump 7 daily/4 weekly + pg_dump

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

## ✅ Coral USB TPU — done 2026-08-17

- [x] Plugged in to Node 01
- [x] Verified: enumerates `18d1:9302 Google Inc.` at 5000 Mbps once firmware
      loads. It shows as `1a6e:089a` at 480 Mbps beforehand — that is the
      bootloader, not a bad port, so `lsusb | grep Google` returns nothing until
      something has loaded the runtime once.
- [x] Passed through to Frigate as the whole `/dev/bus/usb` bus — the device path
      changes on re-enumeration, so a pinned node would break.
- [x] Frigate configured with the `edgetpu` detector: reports `TPU found`,
      ~10 ms inference, and publishes `frigate/available online`.
- [ ] **Cameras.** Detection and recording stay disabled until they exist.
- [ ] **Somewhere to record to.** `/mnt/surveillance/frigate` is a directory on
      the 94 GB root filesystem, not a 4 TB drive. Mount real storage there
      before enabling recording, or it will fill the Proxmox host root.

> The accelerator is single-tenant — one process may hold it, and that is
> Frigate. Anything else wanting object detections should subscribe to
> `frigate/#` on MQTT rather than trying to open the device.

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
