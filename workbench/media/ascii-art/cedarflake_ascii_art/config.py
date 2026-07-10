import logging
import os
import sys
from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_ENV = "CEDARFLAKE_ASCII_ART_CONFIG"


def runtime_root():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return PROJECT_ROOT


def bundled_root():
    bundled_directory = getattr(sys, "_MEIPASS", None)
    return Path(bundled_directory) if bundled_directory else runtime_root()


def default_config_path():
    configured_path = os.getenv(CONFIG_ENV)
    if configured_path:
        return Path(configured_path).expanduser().resolve()

    config_directory = runtime_root() / "configs"
    local_config = config_directory / "config.yaml"
    if local_config.is_file():
        return local_config
    return bundled_root() / "configs" / "config.example.yaml"


class Config:
    def __init__(self, config_path=None):
        path = Path(config_path).expanduser().resolve() if config_path else default_config_path()
        if not path.is_file():
            raise FileNotFoundError(f"配置文件未找到: {path}")

        with path.open("r", encoding="utf-8") as config_file:
            self.config = yaml.safe_load(config_file) or {}

        self.setup_logging()

    def setup_logging(self):
        log_directory = runtime_root() / "logs"
        log_directory.mkdir(parents=True, exist_ok=True)
        log_level_name = self.config.get("log_level", "INFO").upper()
        log_level = getattr(logging, log_level_name, logging.INFO)
        log_format = self.config.get(
            "log_format",
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        )

        logging.basicConfig(
            level=log_level,
            format=log_format,
            handlers=[
                logging.FileHandler(log_directory / "app.log", encoding="utf-8"),
                logging.StreamHandler(),
            ],
        )

    def get(self, key, default=None):
        return self.config.get(key, default)

    def get_output_dir(self, subdir, default=None):
        return self.config.get("output_directories", {}).get(subdir, default)

    def get_default_setting(self, setting, default=None):
        return self.config.get("default_settings", {}).get(setting, default)


config = Config()
logger = logging.getLogger(__name__)
