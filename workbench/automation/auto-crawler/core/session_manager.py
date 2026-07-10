"""
HTTP会话管理器
负责管理网络请求会话，包括代理、用户代理轮换、连接池等
增强版反爬虫机制
"""

import asyncio
import os
import random
import sys
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import aiohttp

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.manager import get_config
from utils.logger import get_logger

logger = get_logger(__name__)


class SessionManager:
    """HTTP会话管理器 - 增强反爬虫版本"""

    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None
        self._user_agents: List[str] = []
        self._proxies: List[str] = []
        self._last_request_time: Dict[str, float] = {}
        self._request_counts: Dict[str, int] = {}
        self._failed_proxies: set = set()
        self._domain_cookies: Dict[str, Dict[str, str]] = {}
        self._request_fingerprints: Dict[str, int] = {}

        # 从配置加载设置
        self._load_config()

        # 增强的浏览器指纹信息
        self._browser_fingerprints = self._generate_browser_fingerprints()

    def _load_config(self):
        """从配置文件加载设置"""
        self._user_agents = get_config(
            "network.user_agents",
            [
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            ],
        )
        self._proxies = get_config("network.proxy_list", [])
        self._ssl_verify = get_config("network.ssl_verify", False)
        self._timeout = get_config("download.timeout", 30)
        self._max_retries = get_config("network.max_retries", 3)
        self._rate_limit = get_config("network.rate_limit", 2.0)

    def _generate_browser_fingerprints(self) -> List[Dict[str, str]]:
        """生成多种浏览器指纹"""
        fingerprints = [
            {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
                "Accept-Encoding": "gzip, deflate, br",
                "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "none",
                "sec-fetch-user": "?1",
                "upgrade-insecure-requests": "1",
            },
            {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate",
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "cross-site",
                "upgrade-insecure-requests": "1",
            },
            {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
                "cache-control": "max-age=0",
                "upgrade-insecure-requests": "1",
            },
        ]
        return fingerprints

    def _get_random_headers(self, url: str) -> Dict[str, str]:
        """获取随机化的请求头"""
        fingerprint = random.choice(self._browser_fingerprints)
        headers = fingerprint.copy()

        # 添加User-Agent
        headers["User-Agent"] = self._get_random_user_agent()

        # 添加Referer (有时候很重要)
        parsed = urlparse(url)
        if parsed.netloc != "bilibili.com":  # 对于非bilibili，可以设置假的referer
            possible_referers = [
                f"https://www.google.com/search?q={parsed.netloc}",
                f"https://{parsed.netloc}/",
                "https://www.bing.com/",
                "https://duckduckgo.com/",
            ]
            headers["Referer"] = random.choice(possible_referers)

        # 添加随机的DNT
        if random.random() < 0.3:
            headers["DNT"] = "1"

        # 随机添加Connection
        if random.random() < 0.7:
            headers["Connection"] = "keep-alive"

        return headers

    async def __aenter__(self):
        """异步上下文管理器入口"""
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """异步上下文管理器出口"""
        await self.close()

    async def start(self):
        """启动会话管理器"""
        if self._session and not self._session.closed:
            return

        # 配置连接器
        connector = aiohttp.TCPConnector(
            limit=100,  # 总连接池大小
            limit_per_host=20,  # 每个主机的连接数限制
            ttl_dns_cache=300,  # DNS缓存时间
            use_dns_cache=True,
            ssl=not self._ssl_verify,
            enable_cleanup_closed=True,
            force_close=False,  # 不强制关闭连接以支持keepalive
            keepalive_timeout=30,  # keepalive超时
        )

        # 配置超时
        timeout = aiohttp.ClientTimeout(total=self._timeout, connect=15, sock_read=15)

        # 创建会话 - 不设置默认headers，每次请求都动态生成
        self._session = aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            cookie_jar=aiohttp.CookieJar(),  # 启用Cookie管理
        )

        logger.info("HTTP会话管理器启动成功 (增强反爬虫版)")

    async def close(self):
        """关闭会话管理器"""
        if self._session and not self._session.closed:
            await self._session.close()
            # 等待连接器清理
            await asyncio.sleep(0.25)

        logger.info("HTTP会话管理器已关闭")

    def _get_random_user_agent(self) -> str:
        """获取随机用户代理"""
        if not self._user_agents:
            return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        return random.choice(self._user_agents)

    def _get_random_proxy(self) -> Optional[str]:
        """获取随机代理"""
        available_proxies = [p for p in self._proxies if p not in self._failed_proxies]
        if not available_proxies:
            return None
        return random.choice(available_proxies)

    async def _wait_for_rate_limit(self, domain: str):
        """智能等待速率限制 - 随机化延迟"""
        if domain in self._last_request_time:
            elapsed = time.time() - self._last_request_time[domain]
            base_wait = self._rate_limit

            # 根据请求次数动态调整等待时间
            request_count = self._request_counts.get(domain, 0)
            if request_count > 10:
                base_wait *= 1.5
            elif request_count > 50:
                base_wait *= 2.0

            if elapsed < base_wait:
                # 添加随机抖动 (±20%)
                jitter = random.uniform(0.8, 1.2)
                wait_time = (base_wait - elapsed) * jitter
                logger.debug(f"智能延迟: {wait_time:.2f}秒 - {domain} (请求数: {request_count})")
                await asyncio.sleep(wait_time)

        self._last_request_time[domain] = time.time()

    def _get_domain(self, url: str) -> str:
        """从URL提取域名"""
        try:
            return urlparse(url).netloc
        except Exception:
            return url

    async def get(
        self,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        proxy: Optional[str] = None,
        allow_redirects: bool = True,
        **kwargs,
    ) -> aiohttp.ClientResponse:
        """发送GET请求"""
        return await self._request(
            "GET", url, headers=headers, proxy=proxy, allow_redirects=allow_redirects, **kwargs
        )

    async def post(
        self,
        url: str,
        data: Any = None,
        json: Any = None,
        headers: Optional[Dict[str, str]] = None,
        proxy: Optional[str] = None,
        **kwargs,
    ) -> aiohttp.ClientResponse:
        """发送POST请求"""
        return await self._request(
            "POST", url, data=data, json=json, headers=headers, proxy=proxy, **kwargs
        )

    async def _request(
        self, method: str, url: str, retries: int = None, **kwargs
    ) -> aiohttp.ClientResponse:
        """发送HTTP请求 - 增强反爬虫版本"""
        if not self._session or self._session.closed:
            await self.start()

        if retries is None:
            retries = self._max_retries

        domain = self._get_domain(url)

        # 智能等待速率限制
        await self._wait_for_rate_limit(domain)

        # 准备请求参数
        request_kwargs = kwargs.copy()

        # 生成动态请求头
        headers = request_kwargs.get("headers", {}) or {}  # 确保不为None
        dynamic_headers = self._get_random_headers(url)

        # 合并用户自定义headers
        if headers:
            for key, value in headers.items():
                dynamic_headers[key] = value

        request_kwargs["headers"] = dynamic_headers

        # 设置代理
        proxy = request_kwargs.get("proxy") or self._get_random_proxy()
        if proxy:
            request_kwargs["proxy"] = proxy

        last_exception = None

        for attempt in range(retries + 1):
            try:
                logger.debug(f"{method} {url} (尝试 {attempt + 1}/{retries + 1})")

                # 添加随机延迟防止过于规律
                if attempt > 0:
                    jitter_delay = random.uniform(0.5, 2.0)
                    await asyncio.sleep(jitter_delay)

                response = await self._session.request(method, url, **request_kwargs)

                # 更新请求统计
                self._request_counts[domain] = self._request_counts.get(domain, 0) + 1

                # 智能处理不同的响应状态
                if response.status == 412:
                    logger.warning(f"HTTP 412 (Precondition Failed) - 可能需要更多headers: {url}")
                    # 为下次请求增加更多headers
                    dynamic_headers.update({"Cache-Control": "no-cache", "Pragma": "no-cache"})
                elif response.status == 403:
                    logger.warning(f"HTTP 403 (Forbidden) - 可能被反爬虫识别: {url}")
                    # 增加更长的延迟
                    await asyncio.sleep(random.uniform(5, 10))
                elif response.status == 429:  # Too Many Requests
                    logger.info(f"HTTP 429 - 遇到限流，增加等待时间: {domain}")
                    await asyncio.sleep(self._rate_limit * random.uniform(3, 6))
                elif response.status >= 500:
                    logger.warning(f"HTTP {response.status} (服务器错误) - {url}")

                return response

            except asyncio.TimeoutError as e:
                last_exception = e
                logger.warning(f"请求超时 {url} (尝试 {attempt + 1}/{retries + 1})")

            except aiohttp.ClientProxyConnectionError as e:
                last_exception = e
                logger.warning(f"代理连接错误 {proxy} - {url}")
                if proxy:
                    self._failed_proxies.add(proxy)
                    # 尝试新的代理
                    proxy = self._get_random_proxy()
                    if proxy:
                        request_kwargs["proxy"] = proxy
                    else:
                        request_kwargs.pop("proxy", None)

            except aiohttp.ClientError as e:
                last_exception = e
                logger.warning(f"客户端错误: {e} - {url} (尝试 {attempt + 1}/{retries + 1})")

            except Exception as e:
                last_exception = e
                logger.error(f"未知错误: {e} - {url} (尝试 {attempt + 1}/{retries + 1})")

            # 重试前等待 - 指数退避 + 随机抖动
            if attempt < retries:
                base_wait = min(2**attempt, 15)  # 指数退避，最大15秒
                jitter = random.uniform(0.5, 1.5)  # 随机抖动
                wait_time = base_wait * jitter
                await asyncio.sleep(wait_time)

        # 所有重试都失败了
        logger.error(f"请求最终失败: {url}")
        if last_exception:
            raise last_exception
        else:
            raise aiohttp.ClientError(f"请求失败: {url}")

    async def download_file(self, url: str, chunk_size: int = 8192, **kwargs) -> bytes:
        """下载文件内容"""
        async with await self.get(url, **kwargs) as response:
            response.raise_for_status()

            content = b""
            async for chunk in response.content.iter_chunked(chunk_size):
                content += chunk

            return content

    def get_stats(self) -> Dict[str, Any]:
        """获取会话统计信息"""
        return {
            "request_counts": self._request_counts.copy(),
            "failed_proxies": len(self._failed_proxies),
            "total_requests": sum(self._request_counts.values()),
            "active_domains": len(self._request_counts),
            "domains_with_cookies": len(self._domain_cookies),
        }

    def reset_failed_proxies(self):
        """重置失败的代理列表"""
        self._failed_proxies.clear()
        logger.info("已重置失败代理列表")


# 全局会话管理器实例
session_manager = SessionManager()


async def get_session() -> SessionManager:
    """获取全局会话管理器"""
    if not session_manager._session or session_manager._session.closed:
        await session_manager.start()
    return session_manager


async def close_session():
    """关闭全局会话管理器"""
    await session_manager.close()
