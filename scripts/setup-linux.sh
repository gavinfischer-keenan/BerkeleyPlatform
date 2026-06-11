#!/usr/bin/env bash
# =============================================================================
# Berkeley Platform — Linux Server Initial Setup
# =============================================================================
# Run once on a fresh Intel Linux box (Ubuntu/Debian).
# Installs all system dependencies and clones all repos.
#
# Usage:
#   chmod +x scripts/setup-linux.sh
#   sudo ./scripts/setup-linux.sh
# =============================================================================

set -euo pipefail

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     Berkeley Home Intelligence Platform — Setup             ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# ── System packages ──────────────────────────────────────────────────
echo ""
echo "▶ Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
    python3 python3-venv python3-pip \
    ffmpeg \
    git curl wget \
    docker.io docker-compose-plugin \
    mosquitto mosquitto-clients

# Enable Docker
systemctl enable docker
systemctl start docker

echo "✅ System packages installed"

# ── Mosquitto (native, not Docker) ───────────────────────────────────
echo ""
echo "▶ Configuring Mosquitto..."
cp services/mosquitto/mosquitto.conf /etc/mosquitto/conf.d/berkeley.conf
systemctl enable mosquitto
systemctl restart mosquitto
echo "✅ Mosquitto running on port 1883"

# ── Clone repos (if not already present) ─────────────────────────────
REPO_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")"
PARENT_DIR="$(dirname "$REPO_DIR")"

echo ""
echo "▶ Cloning service repos into $PARENT_DIR..."

repos=(
    "gavinfischer-keenan/Earthquakepredictionengine:EarthquakePredictionEngine"
    "gavinfischer-keenan/BerkeleyEnvironmental:BerkeleyEnvironmental"
    "gavinfischer-keenan/BerkeleyAudioReceiver:BerkeleyAudioReceiver"
    "gavinfischer-keenan/BerkeleyHomeSensors:BerkeleyHomeSensors"
    "gavinfischer-keenan/BerkeleyEventStore:BerkeleyEventStore"
)

for entry in "${repos[@]}"; do
    repo="${entry%%:*}"
    dir="${entry##*:}"
    if [ ! -d "$PARENT_DIR/$dir" ]; then
        git clone "https://github.com/$repo.git" "$PARENT_DIR/$dir"
        echo "  ✅ Cloned $dir"
    else
        echo "  ⏭  $dir already exists"
    fi
done

# ── BirdNET + BatNET ─────────────────────────────────────────────────
echo ""
echo "▶ Installing BirdNET-Analyzer..."
if [ ! -d /opt/BirdNET-Analyzer ]; then
    git clone https://github.com/kahst/BirdNET-Analyzer.git /opt/BirdNET-Analyzer
    cd /opt/BirdNET-Analyzer
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
    echo "  ✅ BirdNET installed"
else
    echo "  ⏭  BirdNET already installed"
fi

echo ""
echo "▶ Installing BatNET-Detector..."
if [ ! -d /opt/BatNET-Detector ]; then
    git clone https://github.com/kahst/BatNET-Detector.git /opt/BatNET-Detector
    cd /opt/BatNET-Detector
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt 2>/dev/null || true
    echo "  ✅ BatNET installed"
else
    echo "  ⏭  BatNET already installed"
fi

# ── Create shared directories ────────────────────────────────────────
echo ""
echo "▶ Creating shared directories..."
mkdir -p /var/lib/berkeley
mkdir -p /var/log/berkeley
chown -R "$SUDO_USER:$SUDO_USER" /var/lib/berkeley /var/log/berkeley
echo "✅ Directories created"

# ── Summary ──────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Setup Complete!                                            ║"
echo "║                                                             ║"
echo "║  Next steps:                                                ║"
echo "║  1. cp .env.example .env && nano .env                       ║"
echo "║  2. Set INFLUXDB_TOKEN, RACHIO_API_KEY                      ║"
echo "║  3. docker compose up -d influxdb                           ║"
echo "║  4. Start agents:                                           ║"
echo "║     cd ../EarthquakePredictionEngine && pip install -e .     ║"
echo "║     cd ../BerkeleyEnvironmental && pip install -e .          ║"
echo "║     cd ../BerkeleyAudioReceiver && pip install -r req*.txt   ║"
echo "║     cd ../BerkeleyHomeSensors && pip install -e .            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
