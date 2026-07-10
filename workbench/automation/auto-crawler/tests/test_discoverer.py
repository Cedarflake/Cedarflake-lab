"""
网站发现器单元测试
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.site_discoverer import SiteDiscoverer, SiteInfo


class TestSiteDiscoverer:
    """网站发现器测试类"""

    @pytest.fixture
    def discoverer(self):
        """测试用的发现器实例"""
        return SiteDiscoverer()

    def test_image_url_detection(self, discoverer):
        """测试图片URL识别"""
        # 正确的图片URL
        assert discoverer._is_image_url("https://example.com/image.jpg")
        assert discoverer._is_image_url("https://example.com/photo.png")
        assert discoverer._is_image_url("https://example.com/pic.gif")
        assert discoverer._is_image_url("https://example.com/thumb/image.webp")

        # 错误的URL
        assert not discoverer._is_image_url("https://example.com/page.html")
        assert not discoverer._is_image_url("https://example.com/script.js")

    def test_site_score_calculation(self, discoverer):
        """测试网站评分计算"""
        # 高分网站
        score = discoverer._calculate_site_score(
            url="https://photo-gallery.com",
            title="Photo Gallery - Beautiful Images",
            description="A collection of beautiful photographs",
            image_count=50,
            content='<html><head><meta name="description" content="gallery"><style></style></head><body>gallery photos</body></html>',
        )
        assert score > 50

        # 低分网站
        score = discoverer._calculate_site_score(
            url="https://news-blog.com",
            title="News Blog",
            description="Latest news and updates",
            image_count=5,
            content="<html><body>news content</body></html>",
        )
        assert score < 30

    def test_image_site_detection(self, discoverer):
        """测试图片网站判断"""
        # 符合条件的图片网站
        assert discoverer._is_image_site(
            url="https://photo-gallery.com",
            title="Photo Gallery",
            description="Beautiful photos",
            image_count=30,
            score=60,
        )

        # 不符合条件的网站
        assert not discoverer._is_image_site(
            url="https://news-blog.com",
            title="News Blog",
            description="Latest news",
            image_count=5,
            score=20,
        )

    def test_link_filtering(self, discoverer):
        """测试链接过滤"""
        # 应该跟随的链接
        assert discoverer._should_follow_link("https://example.com/gallery")
        assert discoverer._should_follow_link("https://photos.example.com/")

        # 不应该跟随的链接
        assert not discoverer._should_follow_link("https://example.com/admin/")
        assert not discoverer._should_follow_link("https://example.com/file.pdf")
        assert not discoverer._should_follow_link("ftp://example.com/file")

    def test_structure_analysis(self, discoverer):
        """测试网站结构分析"""
        # 有良好结构的内容
        good_content = """
        <html>
        <body>
            <div class="gallery">
                <a href="next">Next</a>
                <div class="category">Photos</div>
                <img src="thumb1.jpg" />
                <img src="thumb2.jpg" />
            </div>
        </body>
        </html>
        """
        score = discoverer._analyze_site_structure(good_content)
        assert score > 10

        # 简单内容
        simple_content = "<html><body>Simple page</body></html>"
        score = discoverer._analyze_site_structure(simple_content)
        assert score <= 5

    def test_content_quality_analysis(self, discoverer):
        """测试内容质量分析"""
        # 高质量内容
        quality_content = (
            """
        <html>
        <head>
            <meta name="description" content="test">
            <style>body { color: black; }</style>
        </head>
        <body>
            <script>console.log('test');</script>
            <div>"""
            + "A" * 5000
            + """</div>
        </body>
        </html>
        """
        )
        score = discoverer._analyze_content_quality(quality_content)
        assert score > 5

        # 低质量内容
        low_quality = "<div>Short content</div>"
        score = discoverer._analyze_content_quality(low_quality)
        assert score < 3

    @pytest.mark.asyncio
    async def test_image_analysis(self, discoverer):
        """测试图片分析"""
        html_content = """
        <html>
        <body>
            <img src="image1.jpg" alt="Image 1" />
            <img src="image2.png" alt="Image 2" />
            <a href="image3.gif">Image 3</a>
            <img src="icon.ico" alt="Icon" />
            <div>Some text</div>
        </body>
        </html>
        """

        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html_content, "html.parser")

        analysis = discoverer._analyze_images(soup, "https://example.com")

        assert analysis["count"] >= 3  # 至少应该发现3个图片
        assert len(analysis["urls"]) >= 3
        assert analysis["img_tags"] == 3  # HTML中有3个img标签


@pytest.mark.asyncio
async def test_site_info_dataclass():
    """测试SiteInfo数据类"""
    site_info = SiteInfo(
        url="https://example.com", domain="example.com", title="Test Site", image_count=10
    )

    assert site_info.url == "https://example.com"
    assert site_info.image_urls == []  # 默认空列表
    assert site_info.metadata == {}  # 默认空字典


if __name__ == "__main__":
    pytest.main([__file__])
