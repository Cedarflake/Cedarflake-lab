"""
测试main.py的发现流程，找出为什么发现0个网站
"""

import asyncio
import os
import sys

import pytest

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.manager import get_config
from core.site_discoverer import SiteDiscoverer

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def test_main_flow():
    """测试main.py的发现流程"""
    print("🧪 测试main.py的发现流程...")

    # 1. 获取配置
    seed_sites = get_config("discovery.seed_sites", [])
    print(f"从配置获取的种子网站: {seed_sites}")

    max_depth = get_config("discovery.max_depth", 5)
    print(f"最大深度配置: {max_depth}")

    min_images_threshold = get_config("discovery.min_images_threshold", 20)
    print(f"最小图片数阈值: {min_images_threshold}")

    # 2. 创建SiteDiscoverer
    print("\n🔧 创建SiteDiscoverer...")
    discoverer = SiteDiscoverer()
    await discoverer.initialize()

    print("SiteDiscoverer配置:")
    print(f"  - max_depth: {discoverer.max_depth}")
    print(f"  - min_images_threshold: {discoverer.min_images_threshold}")
    print(f"  - concurrent_sites: {discoverer.concurrent_sites}")

    # 3. 执行发现
    print("\n🚀 开始从种子网站发现...")
    if not seed_sites:
        print("❌ 没有种子网站！这可能是问题所在")
        return

    try:
        discovered_sites = await discoverer.discover_from_seeds(seed_sites)
        print("\n📊 发现结果:")
        print(f"  - 发现网站数量: {len(discovered_sites)}")

        for site in discovered_sites:
            print(f"  - {site.url}: {site.image_count}张图片, 评分{site.score}")

    except Exception as e:
        print(f"❌ 发现过程出错: {e}")
        import traceback

        traceback.print_exc()


async def test_single_site():
    """单独测试bilibili网站"""
    print("\n🔍 单独测试bilibili网站...")

    discoverer = SiteDiscoverer()
    await discoverer.initialize()

    url = "https://bilibili.com"

    # 创建信号量
    semaphore = asyncio.Semaphore(1)

    # 直接调用处理方法
    result = await discoverer._process_single_site(semaphore, url)

    if result:
        print(f"✅ 成功识别: {result.url}")
        print(f"   图片数量: {result.image_count}")
        print(f"   评分: {result.score}")
        print(f"   标题: {result.title}")
    else:
        print(f"❌ 未能识别为图片网站: {url}")

        # 检查各个步骤
        print("\n🔧 逐步调试:")

        # 检查阈值设置
        print("当前阈值设置:")
        print(f"  - min_images_threshold: {discoverer.min_images_threshold}")
        print(f"  - 图片URL模式数量: {len(discoverer.image_url_patterns)}")


async def main():
    """主测试函数"""
    await test_main_flow()
    await test_single_site()


if __name__ == "__main__":
    asyncio.run(main())
