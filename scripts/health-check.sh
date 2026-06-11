#!/usr/bin/env bash
# =============================================================================
# Health Check — verify all Berkeley agents are online
# =============================================================================
# Reads retained status from Mosquitto. Requires mosquitto-clients.
#
# Usage:
#   ./scripts/health-check.sh [broker_host]
# =============================================================================

set -euo pipefail

BROKER="${1:-localhost}"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  Berkeley Platform Health Check                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

agents=(
    "home/status/earthquake-engine:Earthquake Engine"
    "home/status/environmental-station:Environmental Station"
    "home/status/audio-receiver:Audio Receiver"
    "home/status/home-sensors:Home Sensors"
)

for entry in "${agents[@]}"; do
    topic="${entry%%:*}"
    name="${entry##*:}"
    # Read retained message with 2s timeout
    status=$(mosquitto_sub -h "$BROKER" -t "$topic" -C 1 -W 2 2>/dev/null || echo '{"status":"no_response"}')
    state=$(echo "$status" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "parse_error")

    case "$state" in
        online)  icon="🟢";;
        offline) icon="🔴";;
        *)       icon="⚪";;
    esac

    printf "  %s %-25s %s\n" "$icon" "$name" "$state"
done

echo ""

# ── Infrastructure ──────────────────────────────────────────────
echo "Infrastructure:"
if mosquitto_pub -h "$BROKER" -t "test/health" -m "ping" 2>/dev/null; then
    echo "  🟢 Mosquitto               online"
else
    echo "  🔴 Mosquitto               offline"
fi

if curl -sf "http://localhost:8086/health" >/dev/null 2>&1; then
    echo "  🟢 InfluxDB                online"
else
    echo "  🔴 InfluxDB                offline"
fi

echo ""
