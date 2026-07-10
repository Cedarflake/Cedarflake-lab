"""
日志管理系统
提供统一的日志接口和配置
"""

import logging
import logging.handlers
import sys
from pathlib import Path


class ColoredFormatter(logging.Formatter):
    """带颜色的日志格式化器"""

    # ANSI颜色代码
    COLORS = {
        "DEBUG": "\033[36m",  # 青色
        "INFO": "\033[32m",  # 绿色
        "WARNING": "\033[33m",  # 黄色
        "ERROR": "\033[31m",  # 红色
        "CRITICAL": "\033[35m",  # 紫色
        "RESET": "\033[0m",  # 重置
    }

    def format(self, record):
        # 添加颜色
        if record.levelname in self.COLORS:
            record.levelname = (
                f"{self.COLORS[record.levelname]}{record.levelname}{self.COLORS['RESET']}"
            )

        return super().format(record)


class LoggerManager:
    """日志管理器"""

    def __init__(self):
        self._loggers = {}
        self._log_dir = None
        self._setup_done = False

    def setup_logging(
        self,
        log_level: str = "INFO",
        log_dir: str = "./logs",
        console_output: bool = True,
        file_output: bool = True,
        max_file_size: int = 10 * 1024 * 1024,  # 10MB
        backup_count: int = 5,
    ):
        """设置日志系统"""
        if self._setup_done:
            return

        self._log_dir = Path(log_dir)
        self._log_dir.mkdir(exist_ok=True)

        # 设置根日志器
        root_logger = logging.getLogger()
        root_logger.setLevel(getattr(logging, log_level.upper()))

        # 清除已有的处理器
        root_logger.handlers.clear()

        # 创建格式化器
        console_formatter = ColoredFormatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        file_formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s"
        )

        # 控制台处理器
        if console_output:
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setFormatter(console_formatter)
            root_logger.addHandler(console_handler)

        # 文件处理器
        if file_output:
            # 主日志文件
            main_log_file = self._log_dir / "autocrawler.log"
            file_handler = logging.handlers.RotatingFileHandler(
                main_log_file, maxBytes=max_file_size, backupCount=backup_count, encoding="utf-8"
            )
            file_handler.setFormatter(file_formatter)
            root_logger.addHandler(file_handler)

            # 错误日志文件
            error_log_file = self._log_dir / "error.log"
            error_handler = logging.handlers.RotatingFileHandler(
                error_log_file, maxBytes=max_file_size, backupCount=backup_count, encoding="utf-8"
            )
            error_handler.setLevel(logging.ERROR)
            error_handler.setFormatter(file_formatter)
            root_logger.addHandler(error_handler)

        self._setup_done = True

        # 记录初始化信息
        logger = self.get_logger("LoggerManager")
        logger.info("日志系统初始化完成")
        logger.info(f"日志级别: {log_level}")
        logger.info(f"日志目录: {self._log_dir.absolute()}")

    def get_logger(self, name: str) -> logging.Logger:
        """获取指定名称的日志器"""
        if name not in self._loggers:
            logger = logging.getLogger(name)
            self._loggers[name] = logger

        return self._loggers[name]

    def set_level(self, level: str):
        """设置全局日志级别"""
        log_level = getattr(logging, level.upper())
        for logger in self._loggers.values():
            logger.setLevel(log_level)

        # 也设置根日志器
        logging.getLogger().setLevel(log_level)

    def create_session_log(self, session_id: str) -> logging.Logger:
        """为特定会话创建专用日志文件"""
        if not self._log_dir:
            raise RuntimeError("日志系统未初始化")

        session_logger = logging.getLogger(f"session.{session_id}")

        # 创建会话专用日志文件
        session_log_file = self._log_dir / "sessions" / f"{session_id}.log"
        session_log_file.parent.mkdir(exist_ok=True)

        session_handler = logging.FileHandler(session_log_file, encoding="utf-8")
        session_handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))

        session_logger.addHandler(session_handler)
        session_logger.setLevel(logging.INFO)

        return session_logger

    def cleanup_old_logs(self, days: int = 30):
        """清理旧日志文件"""
        if not self._log_dir or not self._log_dir.exists():
            return

        import time

        cutoff_time = time.time() - (days * 24 * 3600)

        cleaned_count = 0
        for log_file in self._log_dir.rglob("*.log*"):
            if log_file.stat().st_mtime < cutoff_time:
                try:
                    log_file.unlink()
                    cleaned_count += 1
                except OSError:
                    pass

        if cleaned_count > 0:
            logger = self.get_logger("LoggerManager")
            logger.info(f"清理了 {cleaned_count} 个旧日志文件")


# 全局日志管理器实例
logger_manager = LoggerManager()


def setup_logging(**kwargs):
    """便捷函数：设置日志系统"""
    logger_manager.setup_logging(**kwargs)


def get_logger(name: str) -> logging.Logger:
    """便捷函数：获取日志器"""
    return logger_manager.get_logger(name)


def set_log_level(level: str):
    """便捷函数：设置日志级别"""
    logger_manager.set_level(level)


def create_session_log(session_id: str) -> logging.Logger:
    """便捷函数：创建会话日志"""
    return logger_manager.create_session_log(session_id)
