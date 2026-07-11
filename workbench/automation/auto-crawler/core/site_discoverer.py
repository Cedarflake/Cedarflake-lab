"""
网站发现引擎
负责从种子网站发现新的图片网站
"""

import asyncio
import os
import re
import sys
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.manager import get_config
from utils.logger import get_logger
from utils.persistence import get_db

from core.session_manager import get_session

logger = get_logger(__name__)


@dataclass
class SiteInfo:
    """网站信息"""

    url: str
    domain: str
    title: str = ""
    description: str = ""
    image_count: int = 0
    image_urls: List[str] = None
    score: float = 0.0
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.image_urls is None:
            self.image_urls = []
        if self.metadata is None:
            self.metadata = {}


class SiteDiscoverer:
    """网站发现器"""

    def __init__(self):
        self.session_manager = None
        self.db = None
        self.discovered_sites: Set[str] = set()
        self.processed_sites: Set[str] = set()
        self.current_depth = 0
        self.max_depth = 5
        self.stats = {
            "sites_discovered": 0,
            "sites_processed": 0,
            "images_found": 0,
            "start_time": time.time(),
        }

        # 优化的图片网站识别规则
        self.image_site_patterns = [
            r"gallery",
            r"photo",
            r"image",
            r"picture",
            r"pic",
            r"album",
            r"wallpaper",
            r"background",
        ]

        # 优化的图片URL模式 - 更宽松的匹配
        self.image_url_patterns = [
            r"\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$|#)",  # 传统图片扩展名
            r"/thumb/",
            r"/preview/",
            r"/small/",
            r"/medium/",
            r"/large/",
            r"/avatar/",
            r"/face/",  # bilibili头像路径
            r"/cover/",  # 封面图片
            r"\.hdslb\.com/",  # bilibili图片域名
            r"image[s]?/",  # 图片目录
            r"img[s]?/",  # 图片目录
            r"static.*\.(jpg|jpeg|png|gif|webp)",  # 静态资源
            r"upload.*\.(jpg|jpeg|png|gif|webp)",  # 上传文件
        ]

        self._load_config()

    def _load_config(self):
        """加载配置"""
        self.max_depth = get_config("discovery.max_depth", 5)
        self.concurrent_sites = get_config("discovery.concurrent_sites", 10)
        self.min_images_threshold = get_config("discovery.min_images_threshold", 20)
        self.discovery_interval = get_config("discovery.discovery_interval", 3600)

    async def initialize(self):
        """初始化发现器"""
        self.session_manager = await get_session()
        self.db = await get_db()
        logger.info("网站发现器初始化完成")

    async def discover_from_seeds(self, seed_sites: List[str]) -> List[SiteInfo]:
        """从种子网站开始发现"""
        if not self.session_manager:
            await self.initialize()

        logger.info(f"开始从 {len(seed_sites)} 个种子网站发现新站点")
        logger.info(f"种子网站: {seed_sites}")
        logger.info(f"max_depth配置: {self.max_depth}")
        self.stats["start_time"] = time.time()

        self.discovered_sites.clear()
        self.processed_sites.clear()

        pending_sites = await self.db.get_sites_by_status("discovered", limit=None)
        sites_to_process = list(
            dict.fromkeys([*seed_sites, *(site["url"] for site in pending_sites)])
        )
        all_discovered: List[SiteInfo] = []
        depth = 0

        while sites_to_process and (self.max_depth < 0 or depth <= self.max_depth):
            self.current_depth = depth
            logger.info(f"开始第 {depth} 层发现...")
            logger.info(f"第{depth}层处理网站: {sites_to_process}")

            # 批量处理网站
            logger.info(f"开始批量处理 {len(sites_to_process)} 个网站...")
            batch_results = await self._process_sites_batch(sites_to_process)
            all_discovered.extend(batch_results)

            logger.info(f"第 {depth} 层完成，发现 {len(batch_results)} 个潜在网站")
            for result in batch_results:
                logger.info(
                    f"  - 发现: {result.url} (评分: {result.score}, 图片: {result.image_count})"
                )

            # 如果达到最大深度，停止发现
            if self.max_depth >= 0 and depth >= self.max_depth:
                logger.info(f"达到最大深度 {self.max_depth}，停止发现")
                break

            depth += 1
            sites_data = await self.db.get_sites_by_status("discovered", limit=None)
            sites_to_process = [
                site["url"] for site in sites_data if site["url"] not in self.processed_sites
            ]

        logger.info(f"发现完成，总计发现 {len(all_discovered)} 个网站")
        return all_discovered

    async def _process_sites_batch(self, urls: List[str]) -> List[SiteInfo]:
        """批量处理网站"""
        semaphore = asyncio.Semaphore(self.concurrent_sites)
        tasks = []

        for url in urls:
            if url not in self.processed_sites:
                task = self._process_single_site(semaphore, url)
                tasks.append(task)

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # 过滤成功的结果
        discovered_sites = []
        for result in results:
            if isinstance(result, SiteInfo):
                discovered_sites.append(result)
            elif isinstance(result, Exception):
                logger.warning(f"处理网站时出错: {result}")

        return discovered_sites

    async def _process_single_site(
        self, semaphore: asyncio.Semaphore, url: str
    ) -> Optional[SiteInfo]:
        """处理单个网站"""
        async with semaphore:
            site_id = None
            try:
                # 检查是否已处理
                if url in self.processed_sites:
                    logger.debug(f"网站已处理过，跳过: {url}")
                    return None

                self.processed_sites.add(url)
                logger.info(f"🔍 开始处理网站: {url}")
                site_id = await self.db.add_discovered_site(
                    url=url,
                    domain=urlparse(url).netloc,
                    metadata={"depth": self.current_depth},
                )

                # 获取网页内容
                async with await self.session_manager.get(url) as response:
                    logger.info(f"  响应状态: {response.status}")
                    if response.status != 200:
                        logger.warning(f"网站响应错误 {response.status}: {url}")
                        await self.db.update_site_stats(site_id=site_id, status="failed")
                        return None

                    content = await response.text()
                    content_type = response.headers.get("content-type", "")
                    logger.info(f"  内容类型: {content_type}, 长度: {len(content)}")

                    media_type = content_type.partition(";")[0].strip().lower()
                    if media_type not in {"text/html", "application/xhtml+xml"}:
                        logger.warning(f"非HTML内容，跳过: {url}")
                        await self.db.update_site_stats(site_id=site_id, status="failed")
                        return None

                # 所有HTML页面都参与链接发现，不要求当前页面本身是图片站。
                await self._discover_links(url, content)

                # 解析网站信息
                logger.info("  开始分析网站内容...")
                site_info = await self._analyze_site(url, content)

                if site_info:
                    logger.info(f"  ✅ 识别为图片网站: {url}")
                    logger.info(f"     - 图片数量: {site_info.image_count}")
                    logger.info(f"     - 网站评分: {site_info.score}")
                    logger.info(f"     - 网站标题: {site_info.title}")

                    # 保存到数据库
                    await self._save_site_info(site_info)
                    self.stats["sites_discovered"] += 1
                else:
                    logger.info(f"  ❌ 不符合图片网站条件: {url}")
                    await self.db.update_site_stats(site_id=site_id, status="processed")

                self.stats["sites_processed"] += 1
                return site_info

            except Exception as e:
                if site_id is not None:
                    try:
                        await self.db.update_site_stats(site_id=site_id, status="failed")
                    except Exception as status_error:
                        logger.error(f"更新网站失败状态时出错 {url}: {status_error}")
                logger.error(f"处理网站失败 {url}: {e}")
                import traceback

                logger.error(f"详细错误信息: {traceback.format_exc()}")
                return None

    async def _analyze_site(self, url: str, content: str) -> Optional[SiteInfo]:
        """分析网站，判断是否为图片网站"""
        try:
            soup = BeautifulSoup(content, "html.parser")

            # 提取基本信息
            title = ""
            if soup.title:
                title = soup.title.get_text().strip()

            description = ""
            meta_desc = soup.find("meta", attrs={"name": "description"})
            if meta_desc:
                description = meta_desc.get("content", "").strip()

            # 分析图片
            image_analysis = self._analyze_images(soup, url)
            image_count = image_analysis["count"]
            image_urls = image_analysis["urls"]

            # 计算网站评分
            score = self._calculate_site_score(url, title, description, image_count, content)

            # 检查是否符合图片网站条件
            if not self._is_image_site(url, title, description, image_count, score):
                logger.debug(f"网站不符合图片站点条件: {url}")
                return None

            domain = urlparse(url).netloc
            metadata = {
                "page_size": len(content),
                "discovery_depth": self.current_depth,
                "analysis_time": time.time(),
            }

            site_info = SiteInfo(
                url=url,
                domain=domain,
                title=title,
                description=description,
                image_count=image_count,
                image_urls=image_urls[:50],  # 只保存前50个图片URL
                score=score,
                metadata=metadata,
            )

            self.stats["images_found"] += image_count
            logger.info(f"发现图片网站: {url} (图片数: {image_count}, 评分: {score:.2f})")

            return site_info

        except Exception as e:
            logger.error(f"分析网站失败 {url}: {e}")
            return None

    def _analyze_images(self, soup: BeautifulSoup, base_url: str) -> Dict[str, Any]:
        """分析网页中的图片 - 优化版"""
        images = soup.find_all("img")
        image_urls = []
        image_count = 0

        for img in images:
            src = img.get("src")
            if src:
                # 转换为绝对URL
                img_url = urljoin(base_url, src)

                # 使用优化的图片URL检查
                if self._is_image_url_optimized(img_url):
                    image_urls.append(img_url)
                    image_count += 1

        # 分析链接中的图片
        links = soup.find_all("a", href=True)
        for link in links:
            href = link.get("href")
            if href and self._is_image_url_optimized(href):
                img_url = urljoin(base_url, href)
                if img_url not in image_urls:
                    image_urls.append(img_url)
                    image_count += 1

        # 对于图片标签很多但匹配URL较少的情况，采用宽松策略
        if len(images) >= 10 and image_count < len(images) * 0.3:
            # 如果img标签很多但匹配的URL很少，可能是现代网站
            # 采用更宽松的计数策略
            additional_count = min(len(images) - image_count, len(images) // 2)
            image_count += additional_count

        return {"count": image_count, "urls": image_urls, "img_tags": len(images)}

    def _is_image_url(self, url: str) -> bool:
        """检查URL是否为图片 - 原始方法"""
        for pattern in self.image_url_patterns:
            if re.search(pattern, url, re.IGNORECASE):
                return True
        return False

    def _is_image_url_optimized(self, url: str) -> bool:
        """检查URL是否为图片 - 优化版本"""
        if not url:
            return False

        # 先使用原始方法
        if self._is_image_url(url):
            return True

        # 额外的现代网站图片URL判断
        url_lower = url.lower()

        # 检查常见的图片服务域名
        image_domains = [
            "hdslb.com",  # bilibili
            "imgur.com",
            "i.imgur.com",
            "cloudinary.com",
            "amazonaws.com",
            "qpic.cn",  # 腾讯
            "sinaimg.cn",  # 新浪
        ]

        for domain in image_domains:
            if domain in url_lower:
                return True

        # 检查路径中的图片相关关键词
        image_keywords = [
            "avatar",
            "face",
            "cover",
            "thumb",
            "thumbnail",
            "icon",
            "logo",
            "banner",
            "bg",
            "background",
            "photo",
            "pic",
            "image",
            "img",
        ]

        for keyword in image_keywords:
            if keyword in url_lower:
                return True

        # 检查文件名中的图片特征（即使没有扩展名）
        path_parts = url.split("/")
        if path_parts:
            filename = path_parts[-1].lower()
            # 检查是否像图片文件名（包含数字、字母组合）
            if re.match(r"^[a-f0-9]{8,}", filename):  # 像哈希值的文件名
                return True

        return False

    def _calculate_site_score(
        self, url: str, title: str, description: str, image_count: int, content: str
    ) -> float:
        """计算网站评分"""
        score = 0.0

        # 图片数量权重: 40%
        if image_count > 0:
            image_score = min(image_count / 50.0, 1.0) * 40
            score += image_score

        # URL和标题关键词权重: 30%
        keyword_score = 0
        text_to_check = f"{url} {title} {description}".lower()

        for pattern in self.image_site_patterns:
            if re.search(pattern, text_to_check, re.IGNORECASE):
                keyword_score += 5

        score += min(keyword_score, 30)

        # 网站结构权重: 20%
        structure_score = self._analyze_site_structure(content)
        score += structure_score

        # 内容质量权重: 10%
        quality_score = self._analyze_content_quality(content)
        score += quality_score

        return round(score, 2)

    def _analyze_site_structure(self, content: str) -> float:
        """分析网站结构"""
        score = 0.0

        # 检查是否有分页
        if re.search(r"(next|prev|page|more)", content, re.IGNORECASE):
            score += 5

        # 检查是否有分类
        if re.search(r"(category|tag|album)", content, re.IGNORECASE):
            score += 5

        # 检查是否有缩略图
        if re.search(r"(thumb|thumbnail|preview)", content, re.IGNORECASE):
            score += 5

        # 检查是否有画廊结构
        if re.search(r"(gallery|grid|masonry)", content, re.IGNORECASE):
            score += 5

        return min(score, 20)

    def _analyze_content_quality(self, content: str) -> float:
        """分析内容质量"""
        score = 0.0

        # 内容长度
        if len(content) > 10000:
            score += 3
        elif len(content) > 5000:
            score += 2
        elif len(content) > 1000:
            score += 1

        # 检查是否有合理的HTML结构
        if "<head>" in content and "<body>" in content:
            score += 2

        # 检查是否有元数据
        if "<meta" in content:
            score += 2

        # 检查是否有样式
        if "<style>" in content or "css" in content:
            score += 2

        # 检查是否有JavaScript
        if "<script>" in content or "javascript" in content:
            score += 1

        return min(score, 10)

    def _is_image_site(
        self, url: str, title: str, description: str, image_count: int, score: float
    ) -> bool:
        """判断是否为图片网站"""
        # 基本条件：图片数量达到阈值
        if image_count < self.min_images_threshold:
            return False

        # 评分条件：评分达到最低要求
        if score < 30:
            return False

        # 排除明显的非图片网站
        exclude_patterns = [r"blog", r"news", r"forum", r"social", r"chat", r"wiki"]

        text_to_check = f"{url} {title} {description}".lower()
        for pattern in exclude_patterns:
            if re.search(pattern, text_to_check, re.IGNORECASE):
                # 如果图片数量很多，仍然可能是图片网站
                if image_count < 50:
                    return False

        return True

    async def _discover_links(self, base_url: str, content: str):
        """从网页中发现新链接"""
        try:
            soup = BeautifulSoup(content, "html.parser")
            links = soup.find_all("a", href=True)

            discovered_count = 0
            for link in links:
                href = link.get("href")
                if href:
                    full_url = urljoin(base_url, href)

                    # 基本URL过滤
                    if self._should_follow_link(full_url):
                        if full_url not in self.discovered_sites:
                            self.discovered_sites.add(full_url)

                            # 保存到数据库待处理
                            domain = urlparse(full_url).netloc
                            await self.db.add_discovered_site(
                                url=full_url,
                                domain=domain,
                                metadata={"source": base_url, "depth": self.current_depth + 1},
                            )
                            discovered_count += 1

            if discovered_count > 0:
                logger.debug(f"从 {base_url} 发现 {discovered_count} 个新链接")

        except Exception as e:
            logger.error(f"发现链接失败 {base_url}: {e}")

    def _should_follow_link(self, url: str) -> bool:
        """判断是否应该跟随链接"""
        try:
            parsed = urlparse(url)

            # 只处理HTTP/HTTPS链接
            if parsed.scheme not in ["http", "https"]:
                return False

            # 过滤文件扩展名
            exclude_extensions = [
                ".pdf",
                ".doc",
                ".docx",
                ".zip",
                ".rar",
                ".mp3",
                ".mp4",
                ".avi",
                ".mov",
                ".exe",
            ]

            for ext in exclude_extensions:
                if url.lower().endswith(ext):
                    return False

            # 过滤特定路径
            exclude_paths = [
                "/api/",
                "/admin/",
                "/login/",
                "/register/",
                "/cart/",
                "/checkout/",
                "/payment/",
            ]

            for path in exclude_paths:
                if path in parsed.path.lower():
                    return False

            return True

        except Exception:
            return False

    async def _save_site_info(self, site_info: SiteInfo):
        """保存网站信息到数据库"""
        site_id = await self.db.add_discovered_site(
            url=site_info.url,
            domain=site_info.domain,
            title=site_info.title,
            description=site_info.description,
            metadata=site_info.metadata,
        )

        await self.db.update_site_stats(
            site_id=site_id,
            image_count=site_info.image_count,
            score=site_info.score,
            status="processed",
        )

    def get_stats(self) -> Dict[str, Any]:
        """获取发现统计"""
        elapsed_time = time.time() - self.stats["start_time"]

        return {
            **self.stats,
            "elapsed_time": elapsed_time,
            "sites_per_minute": self.stats["sites_processed"] / max(elapsed_time / 60, 1),
            "current_depth": self.current_depth,
            "max_depth": self.max_depth,
        }


# 全局发现器实例
site_discoverer = SiteDiscoverer()


async def get_discoverer() -> SiteDiscoverer:
    """获取全局网站发现器"""
    if not site_discoverer.session_manager:
        await site_discoverer.initialize()
    return site_discoverer
