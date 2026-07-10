"""
AutoCrawler 2.0 主程序入口
智能图片网站发现和批量下载系统
"""

import asyncio
import os
import signal
import sys
from pathlib import Path

# 添加当前目录到系统路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.manager import get_config
from core.image_downloader import ImageDownloader
from core.session_manager import close_session, get_session
from core.site_discoverer import SiteDiscoverer
from utils.logger import get_logger, setup_logging
from utils.persistence import get_database


class AutoCrawler:
    """主爬虫类"""

    def __init__(self):
        self.logger = None
        self.running = False
        self.session_manager = None
        self.site_discoverer = None
        self.image_downloader = None
        self.database = None

    async def initialize(self):
        """初始化系统"""
        # 设置日志
        log_level = get_config("monitoring.log_level", "INFO")
        setup_logging(log_level=log_level, log_dir="./logs", console_output=True, file_output=True)

        self.logger = get_logger("AutoCrawler")
        self.logger.info("=" * 50)
        self.logger.info("AutoCrawler 2.0 正在启动...")
        self.logger.info("=" * 50)

        # 检查配置
        app_name = get_config("app.name")
        app_version = get_config("app.version")
        self.logger.info(f"应用: {app_name} v{app_version}")

        # 创建必要的目录
        self._create_directories()

        # 初始化HTTP会话管理器
        self.session_manager = await get_session()

        # 初始化数据库
        self.database = await get_database()

        # 初始化核心组件
        self.site_discoverer = SiteDiscoverer()
        await self.site_discoverer.initialize()

        self.image_downloader = ImageDownloader()
        await self.image_downloader.initialize()

        self.logger.info("系统初始化完成")

    def _create_directories(self):
        """创建必要的目录"""
        directories = [get_config("storage.base_path", "./downloads"), "./logs", "./data", "./temp"]

        for directory in directories:
            Path(directory).mkdir(parents=True, exist_ok=True)
            self.logger.debug(f"确保目录存在: {directory}")

    async def start_discovery_task(self):
        """启动网站发现任务"""
        self.logger.info("🚀 开始网站发现任务...")

        # 获取种子网站
        seed_sites = get_config("discovery.seed_sites", [])
        if not seed_sites:
            self.logger.warning("没有配置种子网站，添加默认种子网站")
            seed_sites = ["https://www.pixiv.net", "https://unsplash.com"]

        discovery_interval = get_config("discovery.discovery_interval", 3600)

        while self.running:
            try:
                self.logger.info("🔍 开始发现来自种子网站的图片网站...")
                discovered_sites = await self.site_discoverer.discover_from_seeds(seed_sites)

                self.logger.info(f"✅ 总共发现了 {len(discovered_sites)} 个图片网站")

                # 启动下载任务 - 处理本轮发现的网站
                for site_info in discovered_sites:
                    if not self.running:
                        break
                    # 修正：评分系统是0-100分，不是0-1分
                    # bilibili评分42.2应该满足下载条件
                    if site_info.score >= 30:  # 30分以上的网站才下载
                        await self.start_download_task(site_info)
                    else:
                        self.logger.debug(
                            f"跳过低分网站: {site_info.domain} (评分: {site_info.score:.1f})"
                        )

                # 新增：处理数据库中待处理的网站
                await self.process_pending_sites()

                # 等待下一轮发现
                self.logger.info(f"💤 等待 {discovery_interval} 秒后进行下一轮发现...")
                await asyncio.sleep(discovery_interval)

            except Exception as e:
                self.logger.error(f"网站发现任务出错: {e}", exc_info=True)
                await asyncio.sleep(60)  # 出错后等待1分钟

    async def process_pending_sites(self):
        """处理数据库中状态为discovered的待处理网站"""
        try:
            self.logger.info("🔄 处理数据库中的待处理网站...")

            # 获取待处理网站（限制数量避免过载）
            pending_sites = await self.database.get_sites_by_status("discovered", limit=10)

            if not pending_sites:
                self.logger.info("没有待处理的网站")
                return

            self.logger.info(f"发现 {len(pending_sites)} 个待处理网站")

            processed_count = 0
            for site_data in pending_sites:
                if not self.running:
                    break

                try:
                    # 重新分析网站
                    url = site_data["url"]
                    self.logger.info(f"🔍 重新分析网站: {url}")

                    # 获取网页内容
                    async with await self.session_manager.get(url) as response:
                        if response.status == 200:
                            content = await response.text()

                            # 分析网站
                            site_info = await self.site_discoverer._analyze_site(url, content)

                            if site_info and site_info.score >= 30:
                                # 保存分析结果
                                await self.site_discoverer._save_site_info(site_info)

                                # 开始下载
                                await self.start_download_task(site_info)
                                processed_count += 1

                                self.logger.info(
                                    f"✅ 成功处理: {site_info.domain} (评分: {site_info.score:.1f})"
                                )
                            else:
                                # 标记为已处理但不符合条件
                                await self.database.update_site_stats(
                                    site_id=site_data["id"], status="rejected"
                                )
                                self.logger.debug(f"❌ 网站不符合条件: {url}")
                        else:
                            # 标记为失败
                            await self.database.update_site_stats(
                                site_id=site_data["id"], status="failed"
                            )

                except Exception as e:
                    self.logger.error(f"处理网站失败 {site_data['url']}: {e}")

                # 添加延迟避免过于频繁的请求
                await asyncio.sleep(2)

            self.logger.info(
                f"📊 本轮处理完成: {processed_count}/{len(pending_sites)} 个网站成功处理"
            )

        except Exception as e:
            self.logger.error(f"处理待处理网站时出错: {e}", exc_info=True)

    async def start_download_task(self, site_info):
        """启动下载任务"""
        try:
            self.logger.info(f"📥 开始下载来自 {site_info.url} 的图片...")

            # 准备网站信息字典
            site_dict = {
                "id": getattr(site_info, "id", None),
                "url": site_info.url,
                "domain": site_info.domain,
            }

            # 下载图片
            results = await self.image_downloader.download_from_site(
                site_dict, site_info.image_urls
            )

            successful_downloads = sum(1 for r in results if r.success)
            self.logger.info(
                f"✅ 从 {site_info.url} 下载了 {successful_downloads}/{len(results)} 张图片"
            )

        except Exception as e:
            self.logger.error(f"下载任务出错 {site_info.url}: {e}", exc_info=True)

    async def print_status(self):
        """定期打印状态信息"""
        stats_interval = get_config("monitoring.stats_interval", 60)

        while self.running:
            try:
                # 获取统计信息
                stats = await self.database.get_download_stats()

                self.logger.info(
                    f"📊 状态: 已发现网站 {stats['total_sites']} 个，已下载图片 {stats['completed_downloads']} 张"
                )

                await asyncio.sleep(stats_interval)

            except Exception as e:
                self.logger.error(f"状态监控出错: {e}")
                await asyncio.sleep(30)

    async def run(self):
        """运行主程序"""
        try:
            await self.initialize()

            self.running = True
            self.logger.info("🎯 AutoCrawler 已启动，开始执行任务...")

            # 启动并发任务
            tasks = [
                asyncio.create_task(self.start_discovery_task()),
                asyncio.create_task(self.print_status()),
            ]

            # 等待所有任务完成
            await asyncio.gather(*tasks, return_exceptions=True)

        except KeyboardInterrupt:
            self.logger.info("收到终止信号，正在关闭...")
        except Exception as e:
            self.logger.error(f"运行时错误: {e}", exc_info=True)
        finally:
            await self.shutdown()

    async def shutdown(self):
        """关闭系统"""
        self.logger.info("正在关闭系统...")
        self.running = False

        # 关闭会话管理器
        if self.session_manager:
            await close_session()

        self.logger.info("系统已关闭")

    def setup_signal_handlers(self):
        """设置信号处理器"""

        def signal_handler(signum, frame):
            print(f"\n收到信号 {signum}，正在优雅关闭...")
            self.running = False

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)


async def main():
    """主函数"""
    crawler = AutoCrawler()

    # 设置信号处理
    crawler.setup_signal_handlers()

    # 运行爬虫
    await crawler.run()


if __name__ == "__main__":
    try:
        # 检查Python版本
        if sys.version_info < (3, 8):
            print("错误: 需要Python 3.8或更高版本")
            sys.exit(1)

        # 运行主程序
        asyncio.run(main())

    except KeyboardInterrupt:
        print("\n程序被用户中断")
    except Exception as e:
        print(f"启动失败: {e}")
        sys.exit(1)
