"""
智能图片下载器
负责高效下载和管理图片文件
"""

import asyncio
import hashlib
import os
import random
import sys
import time
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urlparse

import aiofiles
import aiosqlite
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.manager import get_config
from utils.logger import get_logger
from utils.persistence import get_db

from core.session_manager import get_session

logger = get_logger(__name__)


@dataclass
class DownloadTask:
    """下载任务"""

    url: str
    site_id: int
    local_path: str = ""
    priority: int = 5  # 1-10, 10为最高优先级
    retry_count: int = 0
    status: str = "pending"  # pending, downloading, completed, failed, skipped
    error_message: str = ""
    file_size: int = 0
    md5_hash: str = ""


@dataclass
class DownloadResult:
    """下载结果"""

    task: DownloadTask
    success: bool
    file_path: str = ""
    file_size: int = 0
    download_time: float = 0.0
    error: str = ""


class ImageDownloader:
    """图片下载器"""

    def __init__(self):
        self.session_manager = None
        self.db = None
        self.download_queue: asyncio.Queue = None
        self.active_downloads: Set[str] = set()
        self.downloaded_hashes: Set[str] = set()
        self.downloaded_urls: Set[str] = set()  # 新增：已下载的URL集合
        self.stats = {
            "total_downloads": 0,
            "successful_downloads": 0,
            "failed_downloads": 0,
            "skipped_downloads": 0,
            "total_bytes": 0,
            "start_time": time.time(),
        }

        self._load_config()

    def _load_config(self):
        """加载配置"""
        self.max_concurrent = get_config("download.max_concurrent", 20)
        self.max_images_per_site = get_config("download.max_images_per_site", 100)
        self.retry_count = get_config("download.retry_count", 3)
        self.timeout = get_config("download.timeout", 30)
        self.min_image_size = get_config("download.min_image_size", 10240)

        self.base_path = Path(get_config("storage.base_path", "./downloads"))
        self.organize_by = get_config("storage.organize_by", "site")
        self.create_subdirs = get_config("storage.create_subdirs", True)
        self.max_storage_gb = get_config("storage.max_storage_gb", 50)

        self.allowed_extensions = get_config(
            "filtering.allowed_extensions", [".jpg", ".jpeg", ".png", ".gif", ".webp"]
        )
        self.max_file_size_mb = get_config("filtering.max_file_size_mb", 50)

    async def initialize(self):
        """初始化下载器"""
        self.session_manager = await get_session()
        self.db = await get_db()
        self.download_queue = asyncio.Queue()

        # 确保下载目录存在
        self.base_path.mkdir(parents=True, exist_ok=True)

        # 加载已下载文件的哈希值
        await self._load_existing_hashes()

        logger.info("图片下载器初始化完成")

    async def _load_existing_hashes(self):
        """加载已存在文件的哈希值和URL，用于去重"""
        try:
            if not self.db:
                return

            await self.db.initialize()

            # 从数据库加载已成功下载的图片URL
            async with aiosqlite.connect(self.db.db_path) as conn:
                # 加载成功下载的URL
                cursor = await conn.execute("""
                    SELECT DISTINCT image_url
                    FROM download_history
                    WHERE status = 'completed' AND local_path IS NOT NULL
                """)
                downloaded_urls = await cursor.fetchall()

                self.downloaded_urls = {url[0] for url in downloaded_urls}
                logger.info(f"从数据库加载了 {len(self.downloaded_urls)} 个已下载的URL")

                # 加载文件哈希值
                cursor = await conn.execute("""
                    SELECT DISTINCT md5_hash
                    FROM download_history
                    WHERE status = 'completed' AND md5_hash IS NOT NULL
                """)
                hash_records = await cursor.fetchall()

                self.downloaded_hashes = {hash_val[0] for hash_val in hash_records}
                logger.info(f"从数据库加载了 {len(self.downloaded_hashes)} 个文件哈希值")

        except Exception as e:
            logger.warning(f"加载已有记录失败: {e}")
            self.downloaded_urls = set()
            self.downloaded_hashes = set()

    async def download_from_site(
        self, site_info: Dict[str, Any], image_urls: List[str]
    ) -> List[DownloadResult]:
        """从指定网站下载图片"""
        if not self.session_manager:
            await self.initialize()

        site_id = site_info.get("id")
        domain = site_info.get("domain", "unknown")

        logger.info(f"开始下载图片 - 网站: {domain}, 图片数: {len(image_urls)}")

        # 限制每个网站的下载数量
        if len(image_urls) > self.max_images_per_site:
            image_urls = image_urls[: self.max_images_per_site]
            logger.info(f"限制下载数量为: {self.max_images_per_site}")

        # 创建下载任务
        tasks = []
        for i, url in enumerate(image_urls):
            if self._should_download_image(url):
                local_path = self._generate_local_path(url, domain, i)
                task = DownloadTask(
                    url=url,
                    site_id=site_id,
                    local_path=local_path,
                    priority=self._calculate_priority(url, site_info),
                )
                tasks.append(task)

        if not tasks:
            logger.info("没有需要下载的图片")
            return []

        # 执行批量下载
        results = await self._download_batch(tasks)

        # 统计结果
        successful = sum(1 for r in results if r.success)
        failed = len(results) - successful

        logger.info(f"下载完成 - 成功: {successful}, 失败: {failed}")

        return results

    def _should_download_image(self, url: str) -> bool:
        """判断是否应该下载该图片"""
        try:
            # 检查URL格式
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                return False

            # 检查是否已下载过此URL
            if url in self.downloaded_urls:
                logger.debug(f"URL已下载过，跳过: {url}")
                return False

            # 检查文件扩展名
            path = parsed.path.lower()
            if not any(path.endswith(ext) for ext in self.allowed_extensions):
                # 如果没有扩展名，尝试从Content-Type判断
                return True  # 暂时允许，下载时再检查

            # 检查是否已在活跃下载中
            if url in self.active_downloads:
                return False

            return True

        except Exception as e:
            logger.debug(f"检查下载条件失败 {url}: {e}")
            return False

    def _generate_local_path(
        self, url: str, domain: str, index: int, content_type: str = None
    ) -> str:
        """生成本地文件路径 - 增强扩展名处理"""
        try:
            parsed = urlparse(url)

            # 提取文件名并处理参数（如bilibili的@参数）
            path_parts = parsed.path.split("/")
            filename = path_parts[-1] if path_parts else "image"

            # 移除URL参数（如@672w_378h_1c_!web-home-common-cover）
            if "@" in filename:
                filename = filename.split("@")[0]

            # 移除查询参数
            if "?" in filename:
                filename = filename.split("?")[0]

            # 尝试从文件名中提取扩展名
            if "." in filename:
                name, ext = os.path.splitext(filename)
                # 验证扩展名是否为有效的图片格式
                valid_extensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]
                if ext.lower() not in valid_extensions:
                    ext = self._get_extension_from_content_type(content_type)
                    filename = name + ext
            else:
                # 如果没有扩展名，从Content-Type推断或使用默认扩展名
                ext = self._get_extension_from_content_type(content_type)
                filename = filename + ext

            # 清理文件名
            filename = self._clean_filename(filename)

            # 如果文件名太长，截取并添加索引
            if len(filename) > 100:
                name, ext = os.path.splitext(filename)
                filename = f"{name[:80]}_{index:04d}{ext}"

            # 根据组织方式创建路径
            if self.organize_by == "site":
                relative_path = Path(domain) / filename
            elif self.organize_by == "date":
                from datetime import datetime

                date_str = datetime.now().strftime("%Y/%m/%d")
                relative_path = Path(date_str) / domain / filename
            else:
                relative_path = Path(filename)

            return str(self.base_path / relative_path)

        except Exception as e:
            logger.error(f"生成文件路径失败 {url}: {e}")
            # 返回一个安全的默认路径
            ext = self._get_extension_from_content_type(content_type)
            safe_filename = f"image_{index:04d}{ext}"
            return str(self.base_path / domain / safe_filename)

    def _clean_filename(self, filename: str) -> str:
        """清理文件名，移除不安全字符"""
        # 移除或替换不安全字符
        unsafe_chars = '<>:"/\\|?*'
        for char in unsafe_chars:
            filename = filename.replace(char, "_")

        # 移除多余的空格和点
        filename = filename.strip(" .")

        # 如果文件名为空，使用默认名称
        if not filename:
            filename = "image.jpg"

        return filename

    def _calculate_priority(self, url: str, site_info: Dict[str, Any]) -> int:
        """计算下载优先级"""
        priority = 5  # 默认优先级

        # 根据网站评分调整优先级
        score = site_info.get("score", 0)
        if score > 80:
            priority = 9
        elif score > 60:
            priority = 7
        elif score > 40:
            priority = 6
        elif score < 20:
            priority = 3

        # 根据URL特征调整优先级
        url_lower = url.lower()
        if any(keyword in url_lower for keyword in ["thumb", "small", "preview"]):
            priority -= 2  # 缩略图优先级较低
        elif any(keyword in url_lower for keyword in ["large", "full", "original"]):
            priority += 1  # 大图优先级较高

        return max(1, min(10, priority))

    async def _download_batch(self, tasks: List[DownloadTask]) -> List[DownloadResult]:
        """批量下载图片"""
        # 按优先级排序
        tasks.sort(key=lambda t: t.priority, reverse=True)

        # 创建信号量控制并发
        semaphore = asyncio.Semaphore(self.max_concurrent)

        # 创建下载协程
        download_coroutines = [self._download_single_image(semaphore, task) for task in tasks]

        # 执行下载
        results = await asyncio.gather(*download_coroutines, return_exceptions=True)

        # 处理结果
        download_results = []
        for result in results:
            if isinstance(result, DownloadResult):
                download_results.append(result)
            elif isinstance(result, Exception):
                logger.error(f"下载异常: {result}")

        return download_results

    async def _download_single_image(
        self, semaphore: asyncio.Semaphore, task: DownloadTask
    ) -> DownloadResult:
        """下载单个图片"""
        async with semaphore:
            start_time = time.time()
            result = DownloadResult(task=task, success=False)

            try:
                # 标记为活跃下载
                self.active_downloads.add(task.url)
                task.status = "downloading"

                # 添加随机延迟，避免请求过于规律
                random_delay = random.uniform(0.5, 2.0)
                await asyncio.sleep(random_delay)

                logger.debug(f"开始下载: {task.url}")

                # 检查存储空间
                if not self._check_storage_space():
                    result.error = "存储空间不足"
                    task.status = "skipped"
                    self.stats["skipped_downloads"] += 1
                    return result

                # 下载文件
                fetch_result = await self._fetch_image_content(task.url)

                if not fetch_result:
                    result.error = "下载内容为空"
                    task.status = "failed"
                    self.stats["failed_downloads"] += 1
                    return result

                file_content, content_type = fetch_result

                # 根据Content-Type更新本地文件路径（确保正确的扩展名）
                domain = urlparse(task.url).netloc
                index = len(self.downloaded_hashes)  # 使用已下载文件数作为索引
                task.local_path = self._generate_local_path(task.url, domain, index, content_type)

                # 验证图片
                if not self._validate_image(file_content):
                    result.error = "图片格式验证失败"
                    task.status = "skipped"
                    self.stats["skipped_downloads"] += 1
                    return result

                # 检查重复
                file_hash = self._calculate_hash(file_content)
                if file_hash in self.downloaded_hashes:
                    result.error = "图片重复"
                    task.status = "skipped"
                    self.stats["skipped_downloads"] += 1
                    return result

                # 保存文件
                saved_path = await self._save_image_file(task.local_path, file_content)

                if saved_path:
                    # 更新任务信息
                    task.status = "completed"
                    task.file_size = len(file_content)
                    task.md5_hash = file_hash

                    # 更新结果
                    result.success = True
                    result.file_path = saved_path
                    result.file_size = len(file_content)
                    result.download_time = time.time() - start_time

                    # 记录哈希
                    self.downloaded_hashes.add(file_hash)

                    # 记录已下载的URL
                    self.downloaded_urls.add(task.url)

                    # 保存到数据库
                    await self._save_download_record(task)

                    # 更新统计
                    self.stats["successful_downloads"] += 1
                    self.stats["total_bytes"] += len(file_content)

                    logger.info(
                        f"✅ 下载成功: {Path(saved_path).name} ({len(file_content) / 1024:.1f}KB)"
                    )
                else:
                    result.error = "保存文件失败"
                    task.status = "failed"
                    self.stats["failed_downloads"] += 1

            except Exception as e:
                result.error = str(e)
                task.status = "failed"
                self.stats["failed_downloads"] += 1
                logger.error(f"下载失败 {task.url}: {e}")

            finally:
                # 移除活跃下载标记
                self.active_downloads.discard(task.url)
                self.stats["total_downloads"] += 1
                result.download_time = time.time() - start_time

            return result

    async def _fetch_image_content(self, url: str) -> Optional[tuple[bytes, str]]:
        """获取图片内容 - 超强反爬虫版，返回(content, content_type)"""
        max_retries = 4  # 增加重试次数

        for attempt in range(max_retries + 1):
            try:
                # 为每次重试准备不同的反爬虫策略
                headers = self._get_anti_crawling_headers(url, attempt)

                # 根据重试次数调整延迟策略
                if attempt > 0:
                    # 使用递增延迟，避免被识别为爬虫
                    delay = min(2**attempt + random.uniform(1, 3), 15)
                    await asyncio.sleep(delay)
                    logger.debug(f"重试延迟 {delay:.1f}s (尝试 {attempt + 1})")

                async with await self.session_manager.get(url, headers=headers) as response:
                    if response.status == 200:
                        # 检查Content-Type
                        content_type = response.headers.get("content-type", "").lower()
                        if not content_type.startswith("image/"):
                            logger.debug(f"非图片内容类型 {content_type}: {url}")
                            return None

                        # 检查文件大小
                        content_length = response.headers.get("content-length")
                        if content_length:
                            size_mb = int(content_length) / (1024 * 1024)
                            if size_mb > self.max_file_size_mb:
                                logger.debug(f"文件过大 {size_mb:.1f}MB: {url}")
                                return None

                        # 读取内容
                        content = await response.read()

                        # 检查最小大小
                        if len(content) < self.min_image_size:
                            logger.debug(f"文件过小 {len(content)} bytes: {url}")
                            return None

                        logger.debug(f"图片下载成功 (尝试 {attempt + 1}): {url}")
                        return content, content_type

                    elif response.status == 403:
                        logger.warning(
                            f"图片响应403错误 (尝试 {attempt + 1}/{max_retries + 1}): {url}"
                        )
                        if attempt < max_retries:
                            # 403错误使用更长的延迟和不同策略
                            continue
                        else:
                            logger.error(f"图片下载最终失败，403错误: {url}")
                            return None
                    elif response.status == 429:  # Too Many Requests
                        retry_after = response.headers.get("Retry-After", 60)
                        wait_time = min(int(retry_after), 300)  # 最多等待5分钟
                        logger.warning(f"遇到速率限制，等待 {wait_time}s: {url}")
                        await asyncio.sleep(wait_time)
                        continue
                    elif response.status in [301, 302, 307, 308]:  # 重定向
                        redirect_url = response.headers.get("Location")
                        if redirect_url:
                            logger.debug(f"重定向到: {redirect_url}")
                            # 递归处理重定向（最多1次避免循环）
                            if attempt == 0:
                                return await self._fetch_image_content(redirect_url)
                    else:
                        logger.warning(f"图片响应错误 {response.status}: {url}")
                        if attempt < max_retries and response.status >= 500:
                            # 服务器错误时重试
                            continue
                        return None

            except asyncio.TimeoutError:
                logger.warning(f"图片请求超时 (尝试 {attempt + 1}/{max_retries + 1}): {url}")
                if attempt < max_retries:
                    continue
                else:
                    return None
            except Exception as e:
                logger.error(f"获取图片内容失败 (尝试 {attempt + 1}/{max_retries + 1}) {url}: {e}")
                if attempt < max_retries:
                    continue
                else:
                    return None

        return None

    def _get_anti_crawling_headers(self, url: str, attempt: int) -> Dict[str, str]:
        """获取反爬虫请求头 - 多重策略"""
        import random

        # 根据尝试次数使用不同策略
        if attempt == 0:
            # 第一次：标准bilibili headers
            return {
                "Referer": "https://www.bilibili.com/",
                "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "Sec-Fetch-Dest": "image",
                "Sec-Fetch-Mode": "no-cors",
                "Sec-Fetch-Site": "same-site",
            }
        elif attempt == 1:
            # 第二次：模拟移动端
            return {
                "Referer": "https://m.bilibili.com/",
                "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9",
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                "Sec-Fetch-Dest": "image",
                "Sec-Fetch-Mode": "no-cors",
            }
        elif attempt == 2:
            # 第三次：模拟直接访问
            return {
                "Referer": url,  # 使用图片URL作为Referer
                "Accept": "*/*",
                "Accept-Language": "zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
                "DNT": "1",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1",
            }
        elif attempt == 3:
            # 第四次：模拟app内嵌webview
            return {
                "Referer": "https://app.bilibili.com/",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "Accept-Language": "zh-CN",
                "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36 BiliApp/7.60.0",
                "X-Requested-With": "tv.danmaku.bili",
                "Sec-Fetch-Dest": "image",
                "Sec-Fetch-Mode": "no-cors",
            }
        else:
            # 第五次：最后的尝试，模拟搜索引擎爬虫
            user_agents = [
                "Googlebot/2.1 (+http://www.google.com/bot.html)",
                "Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)",
                "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
            ]
            return {
                "Accept": "image/*",
                "User-Agent": random.choice(user_agents),
                "Accept-Language": "zh-CN,zh;q=0.9",
            }

    def _validate_image(self, content: bytes) -> bool:
        """验证图片格式"""
        try:
            # 使用PIL验证图片
            with Image.open(BytesIO(content)) as img:
                # 验证图片格式
                if img.format.lower() not in ["jpeg", "png", "gif", "webp", "bmp"]:
                    return False

                # 验证图片大小
                width, height = img.size
                if width < 100 or height < 100:  # 最小尺寸过滤
                    return False

                if width * height > 50000000:  # 像素数过大过滤
                    return False

                return True

        except Exception as e:
            logger.debug(f"图片验证失败: {e}")
            return False

    def _calculate_hash(self, content: bytes) -> str:
        """计算文件哈希"""
        return hashlib.md5(content).hexdigest()

    async def _save_image_file(self, file_path: str, content: bytes) -> Optional[str]:
        """保存图片文件"""
        try:
            # 确保目录存在
            Path(file_path).parent.mkdir(parents=True, exist_ok=True)

            # 如果文件已存在，添加数字后缀
            original_path = file_path
            counter = 1
            while os.path.exists(file_path):
                name, ext = os.path.splitext(original_path)
                file_path = f"{name}_{counter:03d}{ext}"
                counter += 1

            # 异步写入文件
            async with aiofiles.open(file_path, "wb") as f:
                await f.write(content)

            return file_path

        except Exception as e:
            logger.error(f"保存文件失败 {file_path}: {e}")
            return None

    async def _save_download_record(self, task: DownloadTask):
        """保存下载记录到数据库"""
        try:
            await self.db.add_download_record(
                site_id=task.site_id,
                image_url=task.url,
                local_path=task.local_path,
                file_size=task.file_size,
                status=task.status,
                md5_hash=task.md5_hash,
            )
        except Exception as e:
            logger.error(f"保存下载记录失败: {e}")

    def _check_storage_space(self) -> bool:
        """检查存储空间"""
        try:
            # 获取当前已使用空间
            total_size = 0
            for root, dirs, files in os.walk(self.base_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    if os.path.exists(file_path):
                        total_size += os.path.getsize(file_path)

            # 转换为GB
            used_gb = total_size / (1024**3)

            if used_gb >= self.max_storage_gb:
                logger.warning(f"存储空间不足: {used_gb:.2f}GB / {self.max_storage_gb}GB")
                return False

            return True

        except Exception as e:
            logger.error(f"检查存储空间失败: {e}")
            return True  # 出错时允许继续下载

    def get_stats(self) -> Dict[str, Any]:
        """获取下载统计"""
        elapsed_time = time.time() - self.stats["start_time"]

        return {
            **self.stats,
            "elapsed_time": elapsed_time,
            "downloads_per_minute": self.stats["total_downloads"] / max(elapsed_time / 60, 1),
            "success_rate": (
                self.stats["successful_downloads"] / max(self.stats["total_downloads"], 1)
            )
            * 100,
            "average_file_size": self.stats["total_bytes"]
            / max(self.stats["successful_downloads"], 1),
            "total_gb": self.stats["total_bytes"] / (1024**3),
            "active_downloads": len(self.active_downloads),
        }

    def _get_extension_from_content_type(self, content_type: str = None) -> str:
        """从Content-Type推断文件扩展名"""
        if not content_type:
            return ".jpg"  # 默认扩展名

        content_type = content_type.lower()

        # 映射Content-Type到扩展名
        type_mapping = {
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",
            "image/bmp": ".bmp",
            "image/svg+xml": ".svg",
        }

        return type_mapping.get(content_type, ".jpg")


# 全局下载器实例
image_downloader = ImageDownloader()


async def get_downloader() -> ImageDownloader:
    """获取全局图片下载器"""
    if not image_downloader.session_manager:
        await image_downloader.initialize()
    return image_downloader
