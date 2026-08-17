"""Tests for systemd units and frontend static module integrity."""
from __future__ import annotations

from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SYSTEMD_DIR = REPO_ROOT / "services" / "systemd"
STATIC_DIR = REPO_ROOT / "services" / "dashboard" / "frontend" / "public" / "static"


@pytest.mark.parametrize("unit_name", [
    "audio-receiver.service",
    "envstation.service",
    "eqengine.service",
    "home-sensors.service",
    "tracker.service",
])
def test_systemd_service_structure(unit_name: str):
    unit_path = SYSTEMD_DIR / unit_name
    assert unit_path.exists(), f"{unit_name} must exist"
    content = unit_path.read_text(encoding="utf-8")
    assert "[Unit]" in content
    assert "[Service]" in content
    assert "ExecStart=" in content
    assert "[Install]" in content


@pytest.mark.parametrize("module_name", [
    "state.js",
    "map-setup.js",
    "geo.js",
    "render.js",
    "fetch.js",
    "ui-states.js",
    "engine.js",
    "main.js",
])
def test_frontend_modules_exist_and_nonempty(module_name: str):
    mod_path = STATIC_DIR / module_name
    assert mod_path.exists(), f"{module_name} must exist in static directory"
    assert mod_path.stat().st_size > 500, f"{module_name} must not be empty"
