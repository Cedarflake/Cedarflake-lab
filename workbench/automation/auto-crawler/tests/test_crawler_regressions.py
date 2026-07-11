import asyncio
from pathlib import Path

import aiosqlite
import pytest
from core import image_downloader as image_downloader_module
from core.image_downloader import DownloadTask, ImageDownloader
from core.site_discoverer import SiteDiscoverer
from utils.persistence import DatabaseManager


class FakeStream:
    def __init__(self, chunks: list[bytes]):
        self.chunks = chunks

    async def iter_chunked(self, chunk_size: int):
        del chunk_size
        for chunk in self.chunks:
            yield chunk


class FakeResponse:
    def __init__(
        self,
        *,
        status: int = 200,
        headers: dict[str, str] | None = None,
        body: str = "",
        chunks: list[bytes] | None = None,
    ):
        self.status = status
        self.headers = headers or {}
        self.body = body
        self.content = FakeStream(chunks or [])

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return None

    async def text(self) -> str:
        return self.body


class FakeSessionManager:
    def __init__(self, responses: dict[str, FakeResponse]):
        self.responses = responses
        self.requested_urls: list[str] = []

    async def get(self, url: str, headers: dict[str, str] | None = None) -> FakeResponse:
        del headers
        self.requested_urls.append(url)
        return self.responses[url]


@pytest.mark.asyncio
@pytest.mark.parametrize("content_length", [None, "1", "not-a-number"])
async def test_fetch_enforces_stream_limit_without_trusted_content_length(content_length):
    url = "https://images.example.test/photo"
    headers = {"content-type": "image/png"}
    if content_length is not None:
        headers["content-length"] = content_length

    downloader = ImageDownloader()
    downloader.max_file_size_mb = 5 / (1024 * 1024)
    downloader.min_image_size = 0
    downloader.session_manager = FakeSessionManager(
        {url: FakeResponse(headers=headers, chunks=[b"123", b"456"])}
    )

    assert await downloader._fetch_image_content(url) is None


@pytest.mark.asyncio
async def test_fetch_accepts_invalid_length_when_stream_is_within_limit():
    url = "https://images.example.test/photo"
    content_type = "image/png; charset=binary"
    downloader = ImageDownloader()
    downloader.max_file_size_mb = 10 / (1024 * 1024)
    downloader.min_image_size = 0
    downloader.session_manager = FakeSessionManager(
        {
            url: FakeResponse(
                headers={
                    "content-type": content_type,
                    "content-length": "not-a-number",
                },
                chunks=[b"123", b"456"],
            )
        }
    )

    assert await downloader._fetch_image_content(url) == (b"123456", content_type)
    assert downloader._get_extension_from_content_type(content_type) == ".png"


@pytest.mark.asyncio
async def test_concurrent_saves_reserve_distinct_paths(tmp_path: Path):
    downloader = ImageDownloader()
    target = tmp_path / "same.png"

    saved_paths = await asyncio.gather(
        downloader._save_image_file(str(target), b"first"),
        downloader._save_image_file(str(target), b"second"),
    )

    assert None not in saved_paths
    paths = {Path(path) for path in saved_paths if path is not None}
    assert paths == {target, tmp_path / "same_001.png"}
    assert {path.read_bytes() for path in paths} == {b"first", b"second"}


@pytest.mark.asyncio
async def test_download_records_actual_collision_path(tmp_path: Path, monkeypatch):
    database = DatabaseManager(str(tmp_path / "crawler.db"))
    await database.initialize()
    site_id = await database.add_discovered_site(
        url="https://example.test/",
        domain="example.test",
    )

    downloader = ImageDownloader()
    downloader.base_path = tmp_path / "downloads"
    downloader.db = database
    downloader.downloaded_hashes.clear()
    downloader.downloaded_urls.clear()

    url = "https://example.test/photo"
    original_path = Path(
        downloader._generate_local_path(
            url,
            "example.test",
            0,
            "image/png; charset=binary",
        )
    )
    original_path.parent.mkdir(parents=True)
    original_path.write_bytes(b"existing")

    async def fetch_image_content(image_url: str):
        assert image_url == url
        return b"new-image", "image/png; charset=binary"

    monkeypatch.setattr(downloader, "_fetch_image_content", fetch_image_content)
    monkeypatch.setattr(downloader, "_check_storage_space", lambda: True)
    monkeypatch.setattr(downloader, "_validate_image", lambda content: True)
    monkeypatch.setattr(image_downloader_module.random, "uniform", lambda start, end: 0)

    task = DownloadTask(url=url, site_id=site_id)
    result = await downloader._download_single_image(asyncio.Semaphore(1), task)

    assert result.success
    assert task.local_path == result.file_path
    assert Path(result.file_path) == original_path.with_name("photo_001.png")
    assert original_path.read_bytes() == b"existing"

    async with aiosqlite.connect(database.db_path) as connection:
        cursor = await connection.execute(
            "SELECT local_path FROM download_history WHERE image_url = ?",
            (url,),
        )
        row = await cursor.fetchone()

    assert row is not None
    assert row[0] == result.file_path


@pytest.mark.asyncio
async def test_unlimited_discovery_exhausts_each_html_level(tmp_path: Path):
    database = DatabaseManager(str(tmp_path / "crawler.db"))
    await database.initialize()

    root_url = "https://example.test/"
    first_url = "https://example.test/first"
    second_url = "https://example.test/second"
    session = FakeSessionManager(
        {
            root_url: FakeResponse(
                headers={"content-type": "text/html; charset=utf-8"},
                body='<html><body><a href="/first">First</a></body></html>',
            ),
            first_url: FakeResponse(
                headers={"content-type": "application/xhtml+xml"},
                body='<html><body><a href="/second">Second</a></body></html>',
            ),
            second_url: FakeResponse(
                headers={"content-type": "text/html"},
                body="<html><body>Done</body></html>",
            ),
        }
    )

    discoverer = SiteDiscoverer()
    discoverer.db = database
    discoverer.session_manager = session
    discoverer.max_depth = -1
    discoverer.concurrent_sites = 2
    discoverer.min_images_threshold = 100

    assert await discoverer.discover_from_seeds([root_url]) == []
    assert session.requested_urls == [root_url, first_url, second_url]
    assert discoverer.current_depth == 2
    assert await database.get_sites_by_status("discovered", limit=None) == []

    for url in (root_url, first_url, second_url):
        site = await database.get_site_by_url(url)
        assert site is not None
        assert site["status"] == "processed"


@pytest.mark.asyncio
async def test_failed_discovered_page_leaves_queue(tmp_path: Path):
    database = DatabaseManager(str(tmp_path / "crawler.db"))
    await database.initialize()

    root_url = "https://example.test/"
    failed_url = "https://example.test/failed"
    session = FakeSessionManager(
        {
            root_url: FakeResponse(
                headers={"content-type": "text/html"},
                body='<html><body><a href="/failed">Failed</a></body></html>',
            ),
            failed_url: FakeResponse(status=503),
        }
    )

    discoverer = SiteDiscoverer()
    discoverer.db = database
    discoverer.session_manager = session
    discoverer.max_depth = -1
    discoverer.min_images_threshold = 100

    await discoverer.discover_from_seeds([root_url])

    assert session.requested_urls == [root_url, failed_url]
    failed_site = await database.get_site_by_url(failed_url)
    assert failed_site is not None
    assert failed_site["status"] == "failed"
    assert await database.get_sites_by_status("discovered", limit=None) == []


@pytest.mark.asyncio
async def test_add_discovered_site_returns_stable_id(tmp_path: Path):
    database = DatabaseManager(str(tmp_path / "crawler.db"))
    await database.initialize()

    first_id = await database.add_discovered_site(
        url="https://example.test/",
        domain="example.test",
    )
    second_id = await database.add_discovered_site(
        url="https://example.test/",
        domain="example.test",
        title="Updated title",
    )

    assert first_id > 0
    assert second_id == first_id
    site = await database.get_site_by_url("https://example.test/")
    assert site is not None
    assert site["title"] == "Updated title"
