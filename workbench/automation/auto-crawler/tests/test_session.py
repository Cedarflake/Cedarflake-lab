"""
HTTP会话管理器单元测试
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.session_manager import SessionManager


class TestSessionManager:
    """会话管理器测试类"""

    @pytest.fixture
    def session_manager(self):
        """测试用的会话管理器实例"""
        return SessionManager()

    @pytest.mark.asyncio
    async def test_session_creation(self, session_manager):
        """测试会话创建"""
        await session_manager.start()

        assert session_manager._session is not None
        assert not session_manager._session.closed

    @pytest.mark.asyncio
    async def test_session_close(self, session_manager):
        """测试会话关闭"""
        await session_manager.start()
        await session_manager.close()

        assert session_manager._session.closed

    @pytest.mark.asyncio
    async def test_context_manager(self):
        """测试异步上下文管理器"""
        async with SessionManager() as session_manager:
            assert session_manager._session is not None
            assert not session_manager._session.closed

        # 上下文退出后应该自动关闭
        assert session_manager._session.closed

    def test_user_agent_selection(self, session_manager):
        """测试用户代理选择"""
        # 测试默认用户代理
        ua = session_manager._get_random_user_agent()
        assert "Mozilla" in ua

        # 测试自定义用户代理列表
        session_manager._user_agents = ["Test Agent 1", "Test Agent 2"]
        ua = session_manager._get_random_user_agent()
        assert ua in ["Test Agent 1", "Test Agent 2"]

    def test_proxy_selection(self, session_manager):
        """测试代理选择"""
        # 无代理情况
        assert session_manager._get_random_proxy() is None

        # 有代理情况
        session_manager._proxies = ["proxy1", "proxy2"]
        proxy = session_manager._get_random_proxy()
        assert proxy in ["proxy1", "proxy2"]

        # 失败代理被排除
        session_manager._failed_proxies.add("proxy1")
        proxy = session_manager._get_random_proxy()
        assert proxy == "proxy2"

    def test_domain_extraction(self, session_manager):
        """测试域名提取"""
        assert session_manager._get_domain("https://example.com/path") == "example.com"
        assert session_manager._get_domain("http://test.org:8080/") == "test.org:8080"
        assert session_manager._get_domain("invalid-url") == "invalid-url"

    @pytest.mark.asyncio
    async def test_rate_limiting(self, session_manager):
        """测试速率限制"""
        session_manager._rate_limit = 0.1  # 100ms

        import time

        start_time = time.time()

        # 第一次请求应该立即执行
        await session_manager._wait_for_rate_limit("example.com")
        first_call_time = time.time() - start_time

        # 第二次请求应该等待
        await session_manager._wait_for_rate_limit("example.com")
        second_call_time = time.time() - start_time

        # 验证等待时间
        assert second_call_time >= first_call_time + 0.1

    def test_stats_collection(self, session_manager):
        """测试统计信息收集"""
        # 初始状态
        stats = session_manager.get_stats()
        assert stats["total_requests"] == 0
        assert stats["active_domains"] == 0

        # 模拟请求统计
        session_manager._request_counts["example.com"] = 5
        session_manager._request_counts["test.org"] = 3
        session_manager._failed_proxies.add("failed_proxy")

        stats = session_manager.get_stats()
        assert stats["total_requests"] == 8
        assert stats["active_domains"] == 2
        assert stats["failed_proxies"] == 1

    def test_proxy_failure_handling(self, session_manager):
        """测试代理失败处理"""
        session_manager._proxies = ["proxy1", "proxy2", "proxy3"]

        # 标记代理失败
        session_manager._failed_proxies.add("proxy1")

        # 获取可用代理时应该排除失败的代理
        available_proxy = session_manager._get_random_proxy()
        assert available_proxy in ["proxy2", "proxy3"]

        # 重置失败代理
        session_manager.reset_failed_proxies()
        assert len(session_manager._failed_proxies) == 0


@pytest.mark.asyncio
async def test_global_session_functions():
    """测试全局会话函数"""
    from core.session_manager import close_session, get_session

    # 获取全局会话
    session = await get_session()
    assert session is not None
    assert session._session is not None

    # 关闭全局会话
    await close_session()
    assert session._session.closed


if __name__ == "__main__":
    pytest.main([__file__])
