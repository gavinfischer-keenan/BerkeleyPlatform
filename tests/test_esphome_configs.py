"""Tests for ESPHome YAML configurations in BerkeleyPlatform."""
from __future__ import annotations

from pathlib import Path
import yaml
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
ESPHOME_DIR = REPO_ROOT / "esphome"


class ESPHomeLoader(yaml.SafeLoader):
    """Custom YAML loader that parses ESPHome custom tags like !secret and !include."""
    pass


ESPHomeLoader.add_constructor("!secret", lambda loader, node: f"SECRET_{node.value}")
ESPHomeLoader.add_constructor("!include", lambda loader, node: f"INCLUDE_{node.value}")
ESPHomeLoader.add_constructor("!lambda", lambda loader, node: f"LAMBDA_{node.value}")
ESPHomeLoader.add_constructor("!extend", lambda loader, node: loader.construct_mapping(node))


@pytest.mark.parametrize("yaml_filename", [
    "electrical-ct.yaml",
    "leak-sensor.yaml",
    "mmwave-presence.yaml",
    "soil-sensor.yaml",
    "weather-pole.yaml",
])
def test_esphome_yaml_syntax_and_structure(yaml_filename: str):
    file_path = ESPHOME_DIR / yaml_filename
    assert file_path.exists(), f"{yaml_filename} must exist"

    with open(file_path, "r", encoding="utf-8") as f:
        data = yaml.load(f, Loader=ESPHomeLoader)

    assert isinstance(data, dict), f"{yaml_filename} must parse to a dict"
    assert "esphome" in data, f"{yaml_filename} must have 'esphome' block"
    assert "name" in data["esphome"], f"{yaml_filename} must specify a device name"
