"""
配置管理器
负责加载、验证和管理配置文件
"""

import logging
import os
from threading import Lock
from typing import Any, Dict, Optional

import yaml

logger = logging.getLogger(__name__)


class ConfigManager:
    """配置管理器"""

    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or os.path.join(os.path.dirname(__file__), "config.yaml")
        self._config: Dict[str, Any] = {}
        self._last_modified = 0.0
        self._lock = Lock()
        self.load_config()

    def load_config(self) -> None:
        """加载配置文件"""
        try:
            if not os.path.exists(self.config_path):
                logger.warning(f"配置文件不存在: {self.config_path}")
                self._config = self._get_default_config()
                return

            with open(self.config_path, "r", encoding="utf-8") as f:
                config_data = yaml.safe_load(f)

            # 验证配置
            validated_config = self._validate_config(config_data)

            with self._lock:
                self._config = validated_config
                self._last_modified = os.path.getmtime(self.config_path)

            logger.info("配置文件加载成功")

        except Exception as e:
            logger.error(f"加载配置文件失败: {e}")
            self._config = self._get_default_config()

    def _validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """验证配置数据"""
        default_config = self._get_default_config()

        # 递归合并配置，确保所有必需字段都存在
        validated = self._merge_config(default_config, config)

        # 验证特定字段
        if validated["discovery"]["max_depth"] < -1:
            validated["discovery"]["max_depth"] = -1

        if validated["download"]["max_concurrent"] < 1:
            validated["download"]["max_concurrent"] = 1

        if validated["network"]["rate_limit"] < 0.1:
            validated["network"]["rate_limit"] = 0.1

        return validated

    def _merge_config(self, default: Dict, user: Dict) -> Dict:
        """递归合并配置"""
        result = default.copy()

        for key, value in user.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._merge_config(result[key], value)
            else:
                result[key] = value

        return result

    def _get_default_config(self) -> Dict[str, Any]:
        """获取默认配置"""
        return {
            "app": {"name": "AutoCrawler", "version": "2.0.0", "debug": False},
            "discovery": {
                "max_depth": 5,
                "concurrent_sites": 10,
                "discovery_interval": 3600,
                "min_images_threshold": 20,
                "seed_sites": [],
            },
            "download": {
                "max_concurrent": 20,
                "max_images_per_site": 100,
                "retry_count": 3,
                "timeout": 30,
                "min_image_size": 10240,
            },
            "storage": {
                "base_path": "./downloads",
                "organize_by": "site",
                "max_storage_gb": 50,
                "create_subdirs": True,
            },
            "network": {
                "user_agents": ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"],
                "proxy_list": [],
                "ssl_verify": False,
                "rate_limit": 2.0,
                "max_retries": 3,
            },
            "monitoring": {
                "web_port": 8080,
                "enable_api": True,
                "log_level": "INFO",
                "stats_interval": 60,
            },
            "database": {"path": "./data/crawler.db", "backup_interval": 3600},
            "filtering": {
                "allowed_extensions": [".jpg", ".jpeg", ".png", ".gif", ".webp"],
                "blocked_domains": [],
                "whitelist_domains": [],
                "max_file_size_mb": 50,
            },
        }

    def get(self, key: str, default: Any = None) -> Any:
        """获取配置值，支持点号分隔的嵌套键"""
        keys = key.split(".")
        value = self._config

        try:
            for k in keys:
                value = value[k]
            return value
        except (KeyError, TypeError):
            return default

    def set(self, key: str, value: Any) -> None:
        """设置配置值"""
        keys = key.split(".")
        with self._lock:
            config = self._config
            for k in keys[:-1]:
                if k not in config:
                    config[k] = {}
                config = config[k]
            config[keys[-1]] = value

    def get_all(self) -> Dict[str, Any]:
        """获取所有配置"""
        with self._lock:
            return self._config.copy()

    def reload_if_changed(self) -> bool:
        """如果配置文件发生变化，重新加载"""
        if not os.path.exists(self.config_path):
            return False

        current_modified = os.path.getmtime(self.config_path)
        if current_modified > self._last_modified:
            logger.info("检测到配置文件变化，重新加载...")
            self.load_config()
            return True

        return False

    def save_config(self) -> None:
        """保存当前配置到文件"""
        try:
            # 确保目录存在
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)

            with open(self.config_path, "w", encoding="utf-8") as f:
                yaml.dump(self._config, f, default_flow_style=False, allow_unicode=True, indent=2)

            self._last_modified = os.path.getmtime(self.config_path)
            logger.info("配置文件保存成功")

        except Exception as e:
            logger.error(f"保存配置文件失败: {e}")


# 全局配置管理器实例
config_manager = ConfigManager()


def get_config(key: str = None, default: Any = None) -> Any:
    """便捷函数：获取配置"""
    if key is None:
        return config_manager.get_all()
    return config_manager.get(key, default)


def set_config(key: str, value: Any) -> None:
    """便捷函数：设置配置"""
    config_manager.set(key, value)


def reload_config() -> bool:
    """便捷函数：重载配置"""
    return config_manager.reload_if_changed()
