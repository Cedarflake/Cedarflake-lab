# WentUrc_ASCII_Art_Tool/config.py

import os
import logging
import yaml

class Config:
    def __init__(self, config_path=None):
        """
        初始化配置。如果未指定 config_path，则基于本文件(__file__)位置，
        使用相对路径 ../configs/config.yaml 生成绝对路径。
        """
        if config_path is None:
            # __file__ 获取当前文件 config.py 的绝对路径
            # base_dir 即 WentUrc_ASCII_Art_Tool/ 目录
            base_dir = os.path.dirname(os.path.abspath(__file__))

            # 拼接到上一级目录 ../configs/config.yaml
            # 注意这里的 '..' 是指 WentUrc_ASCII_Art_Tool/ 的上一级，即项目根目录
            config_path = os.path.join(base_dir, "..", "configs", "config.yaml")

        if not os.path.exists(config_path):
            raise FileNotFoundError(f"配置文件未找到: {config_path}")

        with open(config_path, "r", encoding="utf-8") as f:
            self.config = yaml.safe_load(f)

        # 根据配置文件内容初始化日志
        self.setup_logging()

    def setup_logging(self):
        os.makedirs("logs", exist_ok=True)  # 确保 logs/ 文件夹存在
        """根据配置文件设置日志记录"""
        log_level_str = self.config.get("log_level", "INFO").upper()
        log_level = getattr(logging, log_level_str, logging.INFO)

        log_format = self.config.get(
            "log_format",
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )

        # 创建日志记录器：输出到控制台和 logs/app.log 文件
        logging.basicConfig(
            level=log_level,
            format=log_format,
            handlers=[
                logging.FileHandler("logs/app.log"),
                logging.StreamHandler()
            ]
        )

        # 也可以根据需要设置其他 logger 或添加 handler
        self.logger = logging.getLogger(__name__)

    def get(self, key, default=None):
        """获取配置项。"""
        return self.config.get(key, default)

    def get_output_dir(self, subdir):
        """获取指定子目录的输出路径"""
        return self.config.get("output_directories", {}).get(subdir, default=None)

    def get_default_setting(self, setting, default=None):
        """获取默认设置项"""
        return self.config.get("default_settings", {}).get(setting, default)


# 实例化全局配置与日志对象
config = Config()
logger = logging.getLogger(__name__)
