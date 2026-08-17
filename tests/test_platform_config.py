"""Tests for BerkeleyPlatform configuration, compose, and environment schemas."""
from __future__ import annotations

import json
from pathlib import Path
import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent


def test_env_example_exists_and_valid():
    env_file = REPO_ROOT / ".env.example"
    assert env_file.exists(), ".env.example must exist"
    content = env_file.read_text(encoding="utf-8")
    assert "NODE01_IP" in content
    assert "NODE02_IP" in content
    assert "MQTT_BROKER" in content


def test_docker_compose_valid_yaml():
    compose_file = REPO_ROOT / "docker-compose.yml"
    assert compose_file.exists(), "docker-compose.yml must exist"
    with open(compose_file, "r", encoding="utf-8") as f:
        compose_data = yaml.safe_load(f)
    assert "services" in compose_data
    services = compose_data["services"]
    assert "mosquitto" in services
    assert "influxdb" in services


def test_dashboard_default_json_valid():
    config_file = REPO_ROOT / "services" / "dashboard" / "config" / "default.json"
    assert config_file.exists(), "default.json config must exist"
    with open(config_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert "location" in data
    assert "center" in data["location"]
    assert "airports" in data
    assert "buoys" in data
