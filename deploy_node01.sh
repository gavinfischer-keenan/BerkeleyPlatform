#!/usr/bin/env bash
# =============================================================================
# deploy_node01.sh — Berkeley Home Intelligence Platform
# Node 01 Deployment Script (Dell OptiPlex SFF — Control Plane)
#
# Usage:
#   ./deploy_node01.sh            # Full deploy
#   ./deploy_node01.sh --pull     # Pull latest images before deploy
#   ./deploy_node01.sh --down     # Tear down Node 01 services (data preserved)
#
# Prerequisites:
#   - Docker Engine + Compose plugin installed
#   - .env file present in the same directory as this script
#   - 4 TB surveillance HDD mounted at /mnt/surveillance
#   - Run as a user with Docker socket access (add to 'docker' group)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Colour helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
abort() { echo -e "${RED}[ABORT]${NC} $*" >&2; exit 1; }

# ─── Banner ──────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Berkeley Home Intelligence Platform — Node 01 Deploy      ║"
echo "║   Dell OptiPlex SFF / Intel i7-8700 / 32 GB / 4 TB HDD     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── Parse arguments ─────────────────────────────────────────────────────────
PULL_IMAGES=false
TEAR_DOWN=false
for arg in "$@"; do
  case "$arg" in
    --pull) PULL_IMAGES=true ;;
    --down) TEAR_DOWN=true ;;
    *) abort "Unknown argument: $arg  (valid: --pull, --down)" ;;
  esac
done

# ─── 1. Verify .env exists ───────────────────────────────────────────────────
info "Checking for .env file..."
if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
  abort ".env file not found at $SCRIPT_DIR/.env
       Copy .env.example → .env and fill in all required values:
         INFLUXDB_PASSWORD   (required — no fallback)
         FRIGATE_RTSP_PASSWORD (required — no fallback)
         INFLUXDB_TOKEN
         MQTT_BROKER  etc."
fi

# Check that the two no-fallback passwords are actually set (not empty)
source "$SCRIPT_DIR/.env" 2>/dev/null || true
if [[ -z "${INFLUXDB_PASSWORD:-}" ]]; then
  abort "INFLUXDB_PASSWORD is not set in .env. Aborting — database would fail to initialise."
fi
if [[ -z "${FRIGATE_RTSP_PASSWORD:-}" ]]; then
  abort "FRIGATE_RTSP_PASSWORD is not set in .env. Aborting — Frigate RTSP streams would be unsecured."
fi
info ".env validated — all required secrets present."

# ─── 2. Verify surveillance HDD is mounted ───────────────────────────────────
info "Checking surveillance HDD mount at /mnt/surveillance..."
if ! mountpoint -q /mnt/surveillance 2>/dev/null; then
  warn "/mnt/surveillance is not a mountpoint."
  warn "The 4 TB HDD must be mounted before deploying Frigate and InfluxDB."
  warn "Add an entry to /etc/fstab, then run:  sudo mount -a"
  warn "Proceeding — but volumes under /mnt/surveillance will use root filesystem if HDD is absent."
fi

# ─── 3. Create host directory tree ───────────────────────────────────────────
info "Creating host directory tree..."

# ── SSD-resident (operational data — fast access) ────────────────────────────
SSD_DIRS=(
  /opt/berkeley/mosquitto/data
  /opt/berkeley/mosquitto/log
  /opt/berkeley/audio
  /opt/berkeley/tracker/photos
  /opt/berkeley/alarms
  /opt/berkeley/messages
)

for dir in "${SSD_DIRS[@]}"; do
  if [[ ! -d "$dir" ]]; then
    sudo mkdir -p "$dir"
    info "  Created (SSD): $dir"
  else
    info "  Exists  (SSD): $dir"
  fi
done

# ── HDD-resident (time-series + surveillance — bulk storage) ─────────────────
HDD_DIRS=(
  /mnt/surveillance/influxdb/data
  /mnt/surveillance/influxdb/config
  /mnt/surveillance/frigate
)

for dir in "${HDD_DIRS[@]}"; do
  if [[ ! -d "$dir" ]]; then
    sudo mkdir -p "$dir"
    info "  Created (HDD): $dir"
  else
    info "  Exists  (HDD): $dir"
  fi
done

# Set appropriate ownership (Docker containers run as UID 1883 for Mosquitto,
# and UID 0 for most others — adjust if running rootless Docker)
sudo chown -R 1883:1883 /opt/berkeley/mosquitto 2>/dev/null || \
  warn "Could not chown mosquitto dirs — container may handle this itself."

info "Host directory tree ready."

# ─── 4. Mosquitto password file ──────────────────────────────────────────────
PASSWD_FILE="$SCRIPT_DIR/services/mosquitto/passwd"
if [[ ! -f "$PASSWD_FILE" ]]; then
  warn "Mosquitto password file not found at $PASSWD_FILE"
  warn "Creating empty placeholder. YOU MUST populate it before MQTT clients can connect:"
  warn "  docker exec berkeley-mosquitto mosquitto_passwd -c /mosquitto/config/passwd <username>"
  warn "  (or pre-generate with: mosquitto_passwd -c $PASSWD_FILE <username>)"
  # Create a valid empty passwd file so the container starts without error
  touch "$PASSWD_FILE"
  chmod 600 "$PASSWD_FILE"
  warn "Empty passwd file created. Mosquitto will start but reject all connections until a user is added."
else
  info "Mosquitto password file found: $PASSWD_FILE"
fi

# ─── 5. Tear-down path ───────────────────────────────────────────────────────
if [[ "$TEAR_DOWN" == true ]]; then
  warn "Tearing down Node 01 services (data volumes are preserved)..."
  docker compose --file "$SCRIPT_DIR/docker-compose.yml" \
    down --remove-orphans
  info "Node 01 services stopped. Host data intact."
  exit 0
fi

# ─── 6. Optional: pull latest images ─────────────────────────────────────────
if [[ "$PULL_IMAGES" == true ]]; then
  info "Pulling latest Docker images..."
  docker compose --file "$SCRIPT_DIR/docker-compose.yml" pull \
    mosquitto influxdb frigate
fi

# ─── 7. Build application images ─────────────────────────────────────────────
info "Building application service images..."
docker compose --file "$SCRIPT_DIR/docker-compose.yml" build \
  earthquake-engine \
  environmental-station \
  audio-receiver \
  home-sensors \
  tracker \
  alarm-service \
  message-service \
  dashboard

# ─── 8. Bring up Node 01 services ────────────────────────────────────────────
# The label filter targets only services with  label: "node=node01"
# This keeps Node 02 services (ollama etc.) commented-out and isolated.
info "Starting Node 01 services..."
docker compose --file "$SCRIPT_DIR/docker-compose.yml" \
  up --detach --remove-orphans \
  mosquitto \
  influxdb \
  frigate \
  earthquake-engine \
  environmental-station \
  audio-receiver \
  home-sensors \
  tracker \
  alarm-service \
  message-service \
  dashboard

# ─── 9. Health check ─────────────────────────────────────────────────────────
info "Waiting 10 seconds for services to initialise..."
sleep 10

echo ""
info "Service status:"
docker compose --file "$SCRIPT_DIR/docker-compose.yml" ps \
  mosquitto influxdb frigate earthquake-engine environmental-station \
  audio-receiver home-sensors tracker alarm-service message-service dashboard

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Node 01 deployment complete.                              ║"
echo "║                                                              ║"
echo "║   Key endpoints:                                             ║"
echo "║     MQTT broker    → mqtt://$(hostname -I | awk '{print $1}'):1883            ║"
echo "║     InfluxDB UI    → http://$(hostname -I | awk '{print $1}'):8086            ║"
echo "║     Frigate UI     → http://$(hostname -I | awk '{print $1}'):5000            ║"
echo "║     Dashboard      → http://$(hostname -I | awk '{print $1}'):8090            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
warn "REMINDER: If this is a first-run, add a Mosquitto user immediately:"
warn "  docker exec berkeley-mosquitto mosquitto_passwd /mosquitto/config/passwd <username>"
warn "Then reload: docker compose restart mosquitto"
