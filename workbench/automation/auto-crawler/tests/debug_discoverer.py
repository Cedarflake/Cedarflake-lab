"""
调试site_discoverer为什么没发现bilibili网站
"""

import asyncio
import os
import sys

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from core.session_manager import SessionManager
from core.site_discoverer import SiteDiscoverer


async def debug_bilibili_analysis():
    """调试bilibili网站分析过程"""
    print("🔍 调试bilibili网站分析过程...")

    # 创建session管理器
    session_manager = SessionManager()
    await session_manager.start()

    # 创建site_discoverer
    discoverer = SiteDiscoverer()
    await discoverer.initialize()

    try:
        url = "https://bilibili.com"
        print(f"分析网站: {url}")

        # 步骤1: 获取网页内容
        print("\n=== 步骤1: 获取网页内容 ===")
        async with await session_manager.get(url) as response:
            if response.status != 200:
                print(f"❌ 网站响应错误: {response.status}")
                return

            content = await response.text()
            content_type = response.headers.get("content-type", "")

            print(f"✅ 响应状态: {response.status}")
            print(f"✅ 内容类型: {content_type}")
            print(f"✅ 内容长度: {len(content)}")

            if "text/html" not in content_type:
                print("❌ 非HTML内容，会被跳过")
                return

        # 步骤2: 解析基本信息
        print("\n=== 步骤2: 解析基本信息 ===")
        soup = BeautifulSoup(content, "html.parser")

        title = ""
        if soup.title:
            title = soup.title.get_text().strip()
        print(f"网站标题: {title}")

        description = ""
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc:
            description = meta_desc.get("content", "").strip()
        print(f"网站描述: {description}")

        # 步骤3: 分析图片
        print("\n=== 步骤3: 分析图片 ===")
        images = soup.find_all("img")
        print(f"找到 <img> 标签数量: {len(images)}")

        # 使用discoverer的图片URL模式
        image_patterns = discoverer.image_url_patterns
        print(f"图片URL模式: {image_patterns}")

        valid_images = 0
        sample_image_urls = []

        for img in images:
            src = img.get("src")
            if src:
                # 转换为绝对URL
                img_url = urljoin(url, src)

                # 使用discoverer的方法检查
                if discoverer._is_image_url(img_url):
                    valid_images += 1
                    if len(sample_image_urls) < 5:
                        sample_image_urls.append(img_url)

        print(f"有效图片URL数量: {valid_images}")
        print("示例图片URL:")
        for img_url in sample_image_urls:
            print(f"  - {img_url}")

        # 分析链接中的图片
        links = soup.find_all("a", href=True)
        link_images = 0
        for link in links:
            href = link.get("href")
            if href and discoverer._is_image_url(href):
                link_images += 1

        print(f"链接中的图片数量: {link_images}")
        total_images = valid_images + link_images
        print(f"总图片数量: {total_images}")

        # 步骤4: 计算评分
        print("\n=== 步骤4: 计算评分 ===")

        # 图片评分 (40%)
        image_score = 0
        if total_images > 0:
            image_score = min(total_images / 50.0, 1.0) * 40
        print(f"图片评分: {image_score:.2f}/40 (基于{total_images}张图片)")

        # 关键词评分 (30%)
        image_site_patterns = discoverer.image_site_patterns
        print(f"图片网站关键词模式: {image_site_patterns}")

        keyword_score = 0
        text_to_check = f"{url} {title} {description}".lower()
        print(f"检查文本: {text_to_check}")

        matched_keywords = []
        for pattern in image_site_patterns:
            if re.search(pattern, text_to_check, re.IGNORECASE):
                keyword_score += 5
                matched_keywords.append(pattern)

        keyword_score = min(keyword_score, 30)
        print(f"关键词评分: {keyword_score}/30 (匹配: {matched_keywords})")

        # 结构评分 (20%)
        structure_score = 0
        structure_checks = [
            ("分页", r"(next|prev|page|more)"),
            ("分类", r"(category|tag|album)"),
            ("缩略图", r"(thumb|thumbnail|preview)"),
            ("画廊", r"(gallery|grid|masonry)"),
        ]

        structure_matches = []
        for name, pattern in structure_checks:
            if re.search(pattern, content, re.IGNORECASE):
                structure_score += 5
                structure_matches.append(name)

        structure_score = min(structure_score, 20)
        print(f"结构评分: {structure_score}/20 (匹配: {structure_matches})")

        # 质量评分 (10%)
        quality_score = 0
        quality_checks = []

        if len(content) > 10000:
            quality_score += 3
            quality_checks.append("长内容(+3)")
        elif len(content) > 5000:
            quality_score += 2
            quality_checks.append("中等内容(+2)")
        elif len(content) > 1000:
            quality_score += 1
            quality_checks.append("短内容(+1)")

        if "<head>" in content and "<body>" in content:
            quality_score += 2
            quality_checks.append("HTML结构(+2)")
        if "<meta" in content:
            quality_score += 2
            quality_checks.append("元数据(+2)")
        if "<style>" in content or "css" in content:
            quality_score += 2
            quality_checks.append("样式(+2)")
        if "<script>" in content or "javascript" in content:
            quality_score += 1
            quality_checks.append("脚本(+1)")

        quality_score = min(quality_score, 10)
        print(f"质量评分: {quality_score}/10 (检查: {quality_checks})")

        # 总评分
        total_score = image_score + keyword_score + structure_score + quality_score
        print(f"\n📊 总评分: {total_score:.2f}/100")

        # 步骤5: 判断是否为图片网站
        print("\n=== 步骤5: 判断条件 ===")
        min_images_threshold = discoverer.min_images_threshold
        print(f"最小图片数阈值: {min_images_threshold}")
        print(
            f"当前图片数量: {total_images} >= {min_images_threshold}? {total_images >= min_images_threshold}"
        )

        min_score = 30
        print(f"最小评分要求: {min_score}")
        print(f"当前评分: {total_score:.2f} >= {min_score}? {total_score >= min_score}")

        is_image_site = total_images >= min_images_threshold and total_score >= min_score
        print(f"\n🎯 最终判断: {'✅ 是图片网站' if is_image_site else '❌ 不是图片网站'}")

        if not is_image_site:
            print("\n💡 不符合条件的原因:")
            if total_images < min_images_threshold:
                print(f"   - 图片数量不足: {total_images} < {min_images_threshold}")
            if total_score < min_score:
                print(f"   - 评分太低: {total_score:.2f} < {min_score}")

    except Exception as e:
        print(f"❌ 调试过程出错: {e}")
        import traceback

        traceback.print_exc()

    finally:
        await session_manager.close()


if __name__ == "__main__":
    asyncio.run(debug_bilibili_analysis())
