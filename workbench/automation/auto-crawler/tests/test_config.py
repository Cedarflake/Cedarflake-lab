"""
配置管理器单元测试
"""

import os
import sys
import tempfile

import pytest
import yaml

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.manager import ConfigManager, get_config


class TestConfigManager:
    """配置管理器测试类"""

    def setup_method(self):
        """测试前准备"""
        self.temp_dir = tempfile.mkdtemp()
        self.config_file = os.path.join(self.temp_dir, "test_config.yaml")

        # 创建测试配置
        self.test_config = {
            "app": {"name": "TestCrawler", "version": "1.0.0", "debug": True},
            "discovery": {"max_depth": 3, "concurrent_sites": 5},
        }

        with open(self.config_file, "w") as f:
            yaml.dump(self.test_config, f)

    def teardown_method(self):
        """测试后清理"""
        import shutil

        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_load_config(self):
        """测试配置加载"""
        manager = ConfigManager(self.config_file)

        assert manager.get("app.name") == "TestCrawler"
        assert manager.get("app.version") == "1.0.0"
        assert manager.get("discovery.max_depth") == 3

    def test_default_config(self):
        """测试默认配置"""
        # 使用不存在的配置文件
        non_existent_file = os.path.join(self.temp_dir, "nonexistent.yaml")
        manager = ConfigManager(non_existent_file)

        # 应该加载默认配置
        assert manager.get("app.name") == "AutoCrawler"
        assert manager.get("discovery.max_depth") == 5

    def test_get_nested_config(self):
        """测试嵌套配置获取"""
        manager = ConfigManager(self.config_file)

        # 测试存在的配置
        assert manager.get("app.name") == "TestCrawler"
        assert manager.get("discovery.max_depth") == 3

        # 测试不存在的配置
        assert manager.get("nonexistent.key") is None
        assert manager.get("nonexistent.key", "default") == "default"

    def test_set_config(self):
        """测试配置设置"""
        manager = ConfigManager(self.config_file)

        # 设置新值
        manager.set("app.new_field", "test_value")
        assert manager.get("app.new_field") == "test_value"

        # 设置嵌套值
        manager.set("new_section.nested.value", 42)
        assert manager.get("new_section.nested.value") == 42

    def test_config_validation(self):
        """测试配置验证"""
        # 创建无效配置
        invalid_config = {
            "discovery": {
                "max_depth": -5,  # 应该被修正为-1
                "concurrent_sites": 0,  # 应该被修正为1
            },
            "network": {
                "rate_limit": -1  # 应该被修正为0.1
            },
        }

        invalid_file = os.path.join(self.temp_dir, "invalid_config.yaml")
        with open(invalid_file, "w") as f:
            yaml.dump(invalid_config, f)

        manager = ConfigManager(invalid_file)

        # 检查值是否被修正
        assert manager.get("discovery.max_depth") == -1
        assert manager.get("download.max_concurrent") >= 1
        assert manager.get("network.rate_limit") >= 0.1

    def test_config_merge(self):
        """测试配置合并"""
        manager = ConfigManager(self.config_file)

        # 用户配置应该覆盖默认配置
        assert manager.get("app.name") == "TestCrawler"  # 用户配置
        assert manager.get("app.debug") is True  # 用户配置

        # 默认配置应该填补缺失的字段
        assert manager.get("storage.base_path") == "./downloads"  # 默认配置

    def test_save_config(self):
        """测试配置保存"""
        manager = ConfigManager(self.config_file)

        # 修改配置
        manager.set("app.test_field", "test_value")

        # 保存配置
        manager.save_config()

        # 重新加载验证
        new_manager = ConfigManager(self.config_file)
        assert new_manager.get("app.test_field") == "test_value"

    def test_reload_on_change(self):
        """测试配置文件变化检测"""
        manager = ConfigManager(self.config_file)

        original_name = manager.get("app.name")

        # 修改配置文件
        import time

        time.sleep(1)  # 确保修改时间不同

        modified_config = self.test_config.copy()
        modified_config["app"]["name"] = "ModifiedCrawler"

        with open(self.config_file, "w") as f:
            yaml.dump(modified_config, f)

        # 检查是否检测到变化
        assert manager.reload_if_changed() is True
        assert manager.get("app.name") == "ModifiedCrawler"
        assert manager.get("app.name") != original_name


def test_global_config_functions():
    """测试全局配置函数"""
    # 这些函数应该能正常工作
    config_data = get_config()
    assert isinstance(config_data, dict)

    app_name = get_config("app.name")
    assert isinstance(app_name, str)

    nonexistent = get_config("nonexistent.key", "default")
    assert nonexistent == "default"


if __name__ == "__main__":
    pytest.main([__file__])
