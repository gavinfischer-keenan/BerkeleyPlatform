# Node 02 — as built

**Host:** Gigabyte GFCANADA · Ryzen 7 7800X3D · RTX 4080 SUPER · `192.168.4.175`
**Proxmox:** VE 9.2.10, kernel 7.0.14-12-pve (Debian 13 trixie)
**Built:** 2026-08-16 · **Status:** TTO stack operational; Berkeley tier partial

This box has two identities. BerkeleyPlatform calls it **Node 02**, the "Brain in a
Jar." `ttoneedmarket` calls it **the server** and had never heard of Node 02. It is
provisioned TTO-primary, with the Berkeley Node 02 roles alongside.

---

## 1. Hardware: planned vs. real

The merged design assumed hardware that is not in the machine. Preflight found:

| | Planned | Actual | Consequence |
| --- | --- | --- | --- |
| RAM | 64 GB (2×32) | **32 GB (2×16 DDR5-6000)** | Container budget rescaled. 2 slots free, 128 GB max. |
| Fast NVMe | Samsung 9100 Pro 2 TB | **not installed** | D2 is moot — see below. |
| Boot NVMe | Kingston SNV2S2000G | **not installed** | — |
| Bulk NVMe | Samsung 990 Pro 2 TB | **present, and it is the boot disk** | Sole fast storage. |
| Extra | — | **Seagate 7.3 TB USB HDD, empty** | Unclaimed backup target. |
| GPU | RTX 4080 SUPER | as specified | — |
| CPU | Ryzen 7 7800X3D | as specified | — |
| NIC | 2.5 GbE | RTL8125, **negotiated 1 Gb** | Switch or cable is the limit. |
| PVE | 8.x | **9.2.10 / trixie** | Helps — see D6. |
| LAN | `192.168.4.0/24` | **`/22`**, gw `.4.1` | Berkeley docs say `192.168.1.x`; wrong on both counts. |

The RAM swap and the second and third NVMe drives from the Berkeley Day-2 checklist
were never done. Everything below is built for the hardware that is actually present.

## 2. Decisions

The four from the merged design, plus four the build forced.

| # | Decision | Status |
| --- | --- | --- |
| D1 | Host NVIDIA driver + shared `/dev/nvidia*` into LXC, no VFIO | **Implemented and verified.** `nvidia-smi` works inside unprivileged CT 110. |
| D2 | 9100 Pro carries TTO Postgres | **Moot.** One drive exists; TTO is on it. |
| D3 | Postgres on an isolated bridge, unreachable from the LAN | **Implemented and verified.** Answers on `10.20.0.10:5432`, refused on `192.168.4.176:5432`. |
| D4 | Node 02 first, built to run standalone | **Implemented, but its stated mitigation was false** — see D7. |
| **D5** | **ZFS abandoned; LVM-thin retained** | The single NVMe is fully allocated to PVE's `local-lvm` thin pool. Creating `fast`/`bulk` zpools would mean destroying and reinstalling. LVM-thin still gives snapshots; what is lost is ZFS checksumming and compression. |
| **D6** | **Debian 13 everywhere, no PGDG repo** | PVE 9 is trixie-based, which ships Python 3.13.5 (TTO needs ≥3.12) and **pgvector 0.8.0** (`halfvec` needs ≥0.7). The design's plan to pin PGDG is unnecessary. |
| **D7** | **A local Mosquitto was added (CT 103)** | Not in the plan. D4 claimed Berkeley services "retry, they don't crash-loop" without Node 01's broker. False: `BerkeleyDashboard` calls `paho.connect()` synchronously in `mqtt_bridge.start()` and dies on `gaierror`. A broker on the isolated mesh is what makes D4's standalone requirement true. |
| **D8** | **Plain HTTP on the LAN, not `tls internal`** | Nothing is internet-facing and there is no local DNS for `*.mosswood.lan`, so a private CA would add friction with no attacker removed. One-line change in the Caddyfile if wanted. |

## 3. Container map

| VMID | Name | vCPU | RAM | LAN | Mesh | Role |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | `tto-db` | 4 | 8 G | .176 | 10.20.0.10 | PostgreSQL 17.11 + pgvector 0.8.0 |
| 101 | `tto-app` | 6 | 6 G | .177 | 10.20.0.11 | TTO venv, uvicorn :8099, blob store |
| 102 | `ingress` | 1 | 512 M | .178 | 10.20.0.12 | Caddy — LAN front door |
| 103 | `mosquitto` | 1 | 512 M | .183 | 10.20.0.40 | MQTT broker (see D7) |
| 110 | `ollama` | 6 | 8 G | .179 | 10.20.0.20 | Ollama + shared GPU |
| 120 | `berkeley-dash` | 2 | 2 G | .180 | 10.20.0.30 | BerkeleyDashboard :8090 |

Ceilings total 25 GB against 30 GB usable. LXC memory is a ceiling, not a
reservation, so real headroom is larger. Ollama was cut from the planned 16 GB to
8 GB because models are resident in the 16 GB of VRAM, not host RAM.

**Not built:** CT 121 `correlation` and CT 122 `ai-garden`. The repos they would
run — `CrossModalAI` and `BerkeleyGarden` — **do not exist**. Berkeley's own
STATUS.md marks CrossModal as a stub. Empty containers would have been theatre.

## 4. Storage

```
Samsung 990 PRO 2TB (nvme0n1)   Proxmox boot · 96 G root · 1.67 T LVM-thin  (2.1% used)
  ├── CT rootfs                 all containers
  ├── vm-100-disk-1  300 G      /var/lib/postgresql
  └── vm-101-disk-1  600 G      /srv/ttoneed/blobs
Seagate 7.3 TB USB (sda)        exfat, factory-fresh, UNCLAIMED
```

The blob store is on its own volume, outside Postgres, as Architecture §10.3 requires.

## 5. Network

`vmbr0` — LAN, 192.168.4.0/22.
`vmbr1` — service mesh, 10.20.0.0/24, **no uplink**. Postgres binds here only.

Proxmox firewall on, `policy_in: DROP`. LAN may reach 22, 8006, 80. Nothing else.

## 6. The TTO acceptance test

HANDOFF's first task was: stand up Postgres with pgvector, then run
`pytest -m requires_db`. That suite had never executed. Results:

**Offline suite: 210 passed, 1 skipped** — reproduces the HANDOFF baseline exactly.

**Migrations: all 12 applied.** 57 tables, 40 enum types, 46 taxonomy nodes seeded.
ADR-0008 feared sqlglot had hidden DDL defects behind `CREATE EXTENSION`,
multi-clause `ALTER TABLE` and plpgsql bodies. **It had not.** The DDL is sound.

One environmental blocker preceded it: the cluster initialised as **SQL_ASCII**
because the container had no UTF-8 locale, and every one of the 12 migrations
contains `§`. `UnicodeEncodeError` on migration 0001. The cluster was rebuilt as
UTF-8 before anything applied.

**Live suite: 3 failed, 10 passed, 7 errors.** All three are defects in the tests,
not the schema:

1. **`test_enum_values_match_vocab` is not namespace-scoped.** Its query filters on
   `pg_type.typname` with no `pg_namespace` join. The fixture builds the schema in
   `ttoneed_test` while the real deployment sits in `public`, so every enum is found
   twice and the list comes back doubled. It passes against a virgin database and
   fails against a real one — the more useful failure of the two.
2. **The `conn` fixture has no savepoints.** The constraint tests are *supposed* to
   trigger violations; each one aborts the transaction, so the teardown
   `DROP SCHEMA` raises `InFailedSqlTransaction`. That single cause produces all 7
   errors and one of the failures. Wrap expected violations in `SAVEPOINT`.
3. **`test_provisional_embeddings_land_in_their_own_partition` inserts `'[1,2,3]'`**
   into `halfvec(1024)`. The test needs a 1024-wide vector.

None of these were fixed — they are code changes to a repo whose standing rule is
that tests pass before check-in, and that is a commit for their author to own.

## 7. The merge point

TTO records an embedding model identity per vector row and declares
`halfvec(1024)`. Berkeley's Ollama serves **`mxbai-embed-large`, which emits exactly
1024 dimensions.** Neither author knew about the other; the widths line up anyway.

Verified end to end: RTX 4080 → Ollama → 1024-dim embedding → `halfvec(1024)`
insert → HNSW cosine search returning ranked taxonomy nodes. Test rows were removed
afterwards; `TTONEED_EMBEDDING_MODEL` is now set to `mxbai-embed-large`.

## 8. Backups

`pg_dump` nightly at 02:30 in CT 100, `-Fc`, 14 days retained, verified by a live run.

**Everything is on one disk.** vzdump is not yet scheduled because the only sensible
target is the 7.3 TB USB drive, which is exfat and needs reformatting — a
destructive act awaiting a decision. Offsite is not configured.

## 9. Open items

- **Reformat the USB drive** to ext4 and schedule vzdump. Blocked on approval.
- **Fix the three test defects** in §6.
- **Berkeley's `mosquitto.conf` will not start.** `keepalive_interval` is a
  bridge-only directive and is set at global scope. Node 01 will hit this too.
- **`BerkeleyDashboard` cannot authenticate to MQTT.** Its `Settings` has no
  username/password field, but the platform's broker sets `allow_anonymous false`.
  They cannot talk as written. Node 02's broker allows anonymous *only* because the
  mesh has no uplink.
- **No local DNS.** `*.mosswood.lan` does not resolve; Caddy's hostname routes are
  configured but reachable only by IP or `Host:` header until DNS exists.
- **Berkeley docs still say `192.168.1.x`.** `.env.example` would hand agents a
  broker address that does not exist.
- **Four ADRs still open** (0003, 0004, 0005, 0006). They change stored data, so
  they are cheapest to resolve now, before the corpus exists.
- **NIC negotiated at 1 Gb**, not 2.5.

## 10. Access

| What | Where |
| --- | --- |
| TTO (primary) | `http://192.168.4.178/` — or direct `http://192.168.4.177:8099/` |
| Berkeley dashboard | `http://192.168.4.180:8090/internal/` and `/public/` |
| Ollama API | `http://192.168.4.179:11434` |
| Proxmox UI | `https://192.168.4.175:8006` |
| SSH | key installed at `~/.ssh/id_ed25519_pve`, alias `node02` |
| TTO DB password | `/root/.tto_db_password` on the host; env at `/etc/ttoneed/ttoneed.env` in CT 101 |
