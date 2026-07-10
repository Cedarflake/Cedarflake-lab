"""
数据持久化模块
负责数据库操作和数据持久化
"""

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiosqlite

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.manager import get_config

from utils.logger import get_logger

logger = get_logger(__name__)


class DatabaseManager:
    """数据库管理器"""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or get_config("database.path", "./data/crawler.db")
        self._ensure_directory()
        self._initialized = False

    def _ensure_directory(self):
        """确保数据库目录存在"""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)

    async def initialize(self):
        """初始化数据库"""
        if self._initialized:
            return

        async with aiosqlite.connect(self.db_path) as db:
            # 创建表结构
            await self._create_tables(db)
            await db.commit()

        self._initialized = True
        logger.info(f"数据库初始化完成: {self.db_path}")

    async def _create_tables(self, db: aiosqlite.Connection):
        """创建数据库表"""

        # 发现的网站表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS discovered_sites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT UNIQUE NOT NULL,
                domain TEXT NOT NULL,
                title TEXT,
                description TEXT,
                discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_visited TIMESTAMP,
                visit_count INTEGER DEFAULT 0,
                image_count INTEGER DEFAULT 0,
                score REAL DEFAULT 0.0,
                status TEXT DEFAULT 'discovered',  -- discovered, processed, failed, blocked
                metadata TEXT  -- JSON格式的额外信息
            )
        """)

        # 下载历史表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS download_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                site_id INTEGER,
                image_url TEXT NOT NULL,
                local_path TEXT,
                file_size INTEGER,
                download_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'pending',  -- pending, completed, failed, skipped
                error_message TEXT,
                md5_hash TEXT,
                FOREIGN KEY (site_id) REFERENCES discovered_sites (id)
            )
        """)

        # 网站统计表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS site_statistics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                site_id INTEGER,
                date DATE DEFAULT (date('now')),
                images_found INTEGER DEFAULT 0,
                images_downloaded INTEGER DEFAULT 0,
                bytes_downloaded INTEGER DEFAULT 0,
                errors_count INTEGER DEFAULT 0,
                avg_response_time REAL DEFAULT 0.0,
                FOREIGN KEY (site_id) REFERENCES discovered_sites (id),
                UNIQUE(site_id, date)
            )
        """)

        # 爬取会话表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS crawl_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP,
                sites_discovered INTEGER DEFAULT 0,
                images_downloaded INTEGER DEFAULT 0,
                total_bytes INTEGER DEFAULT 0,
                status TEXT DEFAULT 'running',  -- running, completed, failed, stopped
                config_snapshot TEXT,  -- JSON格式的配置快照
                error_log TEXT
            )
        """)

        # 创建索引
        await db.execute("CREATE INDEX IF NOT EXISTS idx_sites_domain ON discovered_sites(domain)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_sites_status ON discovered_sites(status)")
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_downloads_site ON download_history(site_id)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_downloads_status ON download_history(status)"
        )
        await db.execute("CREATE INDEX IF NOT EXISTS idx_stats_date ON site_statistics(date)")

    async def add_discovered_site(
        self,
        url: str,
        domain: str,
        title: str = None,
        description: str = None,
        metadata: Dict = None,
    ) -> int:
        """添加发现的网站"""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                """
                INSERT OR IGNORE INTO discovered_sites
                (url, domain, title, description, metadata)
                VALUES (?, ?, ?, ?, ?)
            """,
                (url, domain, title, description, json.dumps(metadata) if metadata else None),
            )

            await db.commit()
            return cursor.lastrowid

    async def get_site_by_url(self, url: str) -> Optional[Dict]:
        """根据URL获取网站信息"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM discovered_sites WHERE url = ?", (url,))
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def update_site_stats(
        self, site_id: int, image_count: int = None, score: float = None, status: str = None
    ):
        """更新网站统计信息"""
        updates = []
        params = []

        if image_count is not None:
            updates.append("image_count = ?")
            params.append(image_count)

        if score is not None:
            updates.append("score = ?")
            params.append(score)

        if status is not None:
            updates.append("status = ?")
            params.append(status)

        if updates:
            updates.append("last_visited = CURRENT_TIMESTAMP")
            params.append(site_id)

            query = f"UPDATE discovered_sites SET {', '.join(updates)} WHERE id = ?"

            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(query, params)
                await db.commit()

    async def add_download_record(
        self,
        site_id: int,
        image_url: str,
        local_path: str = None,
        file_size: int = None,
        status: str = "completed",
        md5_hash: str = None,
    ) -> int:
        """添加下载记录"""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                """
                INSERT INTO download_history
                (site_id, image_url, local_path, file_size, status, md5_hash)
                VALUES (?, ?, ?, ?, ?, ?)
            """,
                (site_id, image_url, local_path, file_size, status, md5_hash),
            )

            await db.commit()
            return cursor.lastrowid

    async def get_sites_by_status(self, status: str, limit: int = 100) -> List[Dict]:
        """根据状态获取网站列表"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                SELECT * FROM discovered_sites
                WHERE status = ?
                ORDER BY score DESC, discovered_at ASC
                LIMIT ?
            """,
                (status, limit),
            )

            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    async def get_download_stats(self) -> Dict[str, Any]:
        """获取下载统计"""
        async with aiosqlite.connect(self.db_path) as db:
            # 总体统计
            cursor = await db.execute("""
                SELECT
                    COUNT(*) as total_sites,
                    SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed_sites,
                    SUM(image_count) as total_images
                FROM discovered_sites
            """)
            overall = await cursor.fetchone()

            # 下载统计
            cursor = await db.execute("""
                SELECT
                    COUNT(*) as total_downloads,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_downloads,
                    SUM(file_size) as total_bytes
                FROM download_history
            """)
            downloads = await cursor.fetchone()

            return {
                "total_sites": overall[0] or 0,
                "processed_sites": overall[1] or 0,
                "total_images": overall[2] or 0,
                "total_downloads": downloads[0] or 0,
                "completed_downloads": downloads[1] or 0,
                "total_bytes": downloads[2] or 0,
            }

    async def create_session(self, session_id: str, config_snapshot: Dict = None) -> int:
        """创建爬取会话"""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                """
                INSERT INTO crawl_sessions (session_id, config_snapshot)
                VALUES (?, ?)
            """,
                (session_id, json.dumps(config_snapshot) if config_snapshot else None),
            )

            await db.commit()
            return cursor.lastrowid

    async def update_session(
        self,
        session_id: str,
        sites_discovered: int = None,
        images_downloaded: int = None,
        total_bytes: int = None,
        status: str = None,
    ):
        """更新会话信息"""
        updates = []
        params = []

        if sites_discovered is not None:
            updates.append("sites_discovered = ?")
            params.append(sites_discovered)

        if images_downloaded is not None:
            updates.append("images_downloaded = ?")
            params.append(images_downloaded)

        if total_bytes is not None:
            updates.append("total_bytes = ?")
            params.append(total_bytes)

        if status is not None:
            updates.append("status = ?")
            params.append(status)
            if status in ["completed", "failed", "stopped"]:
                updates.append("end_time = CURRENT_TIMESTAMP")

        if updates:
            params.append(session_id)
            query = f"UPDATE crawl_sessions SET {', '.join(updates)} WHERE session_id = ?"

            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(query, params)
                await db.commit()

    async def cleanup_old_data(self, days: int = 30):
        """清理旧数据"""
        async with aiosqlite.connect(self.db_path) as db:
            # 清理旧的下载记录
            await db.execute(
                """
                DELETE FROM download_history
                WHERE download_time < datetime('now', '-{} days')
            """.format(days)
            )

            # 清理旧的统计数据
            await db.execute(
                """
                DELETE FROM site_statistics
                WHERE date < date('now', '-{} days')
            """.format(days)
            )

            # 清理旧的会话记录
            await db.execute(
                """
                DELETE FROM crawl_sessions
                WHERE start_time < datetime('now', '-{} days')
            """.format(days)
            )

            await db.commit()

        logger.info(f"清理了 {days} 天前的旧数据")


# 全局数据库管理器实例
db_manager = DatabaseManager()


async def get_database() -> DatabaseManager:
    """获取全局数据库管理器"""
    if not db_manager._initialized:
        await db_manager.initialize()
    return db_manager


async def get_db() -> DatabaseManager:
    """获取全局数据库管理器 (别名)"""
    return await get_database()
