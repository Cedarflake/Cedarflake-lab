import base64
import hashlib
import json
import unittest
from collections import deque
from http.cookies import SimpleCookie
from unittest.mock import AsyncMock, patch
from urllib.parse import urlencode, urlparse

import aiohttp
from campus_net.aggregate import (
    AggregatePortalClient,
    AuthenticationRejected,
    AuthenticationUncertain,
    PortalContext,
    PortalProtocolError,
    _protected_sso_headers,
    _read_limited_body,
)
from campus_net.captive import NetworkState, ProbeResult
from campus_net.config import CaptiveHttpConfig, ProbeConfig
from yarl import URL

PORTAL_ORIGIN = "http://10.71.29.181"
PROBE_URL = "http://connectivity.example/connecttest.txt"
CRYPTO_KEY_1 = base64.b64encode(b"0123456789abcdef").decode("ascii")
CRYPTO_KEY_2 = base64.b64encode(b"fedcba9876543210").decode("ascii")


def config(*, verification_timeout: float = 0.05) -> CaptiveHttpConfig:
    return CaptiveHttpConfig(
        adapter="captive-sso-http",
        interface_index=24,
        user_agent="test-agent",
        probe=ProbeConfig(
            url=PROBE_URL,
            online_status=200,
            online_body="Microsoft Connect Test",
            online_location=None,
            timeout_seconds=1,
        ),
        portal_origin=PORTAL_ORIGIN,
        portal_entry_path="/eportal/index.jsp",
        auth_mode="interactive-system-captcha",
        username="example-student",
        password="example-password",
        service_display_name="中国电信",
        captcha_attempts=0,
        verification_interval_seconds=0.01,
        verification_timeout_seconds=verification_timeout,
    )


def captive_url() -> str:
    return (
        PORTAL_ORIGIN
        + "/eportal/index.jsp?"
        + urlencode(
            {
                "wlanuserip": "user-ip-token",
                "wlanacname": "ac-token",
                "nasip": "nas-token",
                "mac": "mac-token",
            }
        )
    )


def captive_body() -> bytes:
    return f"<script>top.self.location.href='{captive_url()}';</script>".encode()


def sso_page(
    crypto_key: str,
    execution: str,
    *,
    error_code: str = "",
) -> bytes:
    return (
        f'<p id="login-croypto">{crypto_key}</p>'
        f'<p id="login-page-flowkey">{execution}</p>'
        '<p id="recaptchaVendor">system</p>'
        '<p id="riskSystemSwitch"></p>'
        f'<p id="login-error-code">{error_code}</p>'
        '<p id="login-error-msg"></p>'
    ).encode()


class FakeContent:
    def __init__(self, body: bytes) -> None:
        self.body = body
        self.offset = 0

    async def read(self, size: int = -1) -> bytes:
        if self.offset >= len(self.body):
            return b""
        end = len(self.body) if size < 0 else self.offset + size
        chunk = self.body[self.offset : end]
        self.offset += len(chunk)
        return chunk


class FakeResponse:
    def __init__(
        self,
        *,
        status: int = 200,
        headers: dict[str, str] | None = None,
        body: bytes = b"",
        payload: object = None,
    ) -> None:
        self.status = status
        self.headers = headers or {}
        if payload is not None and not body:
            body = json.dumps(payload).encode()
        self.content = FakeContent(body)
        self.payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        return None

    async def json(self, *, content_type=None):
        return self.payload


class FakeSession:
    def __init__(
        self,
        *,
        gets: list[FakeResponse] | None = None,
        posts: list[FakeResponse | Exception] | None = None,
        requests: list[FakeResponse | Exception] | None = None,
    ) -> None:
        self.gets = deque(gets or [])
        self.posts = deque(posts or [])
        self.requests = deque(requests or [])
        self.calls: list[tuple[str, str, dict[str, object]]] = []

    def get(self, url: str, **kwargs: object):
        self.calls.append(("GET", str(url), kwargs))
        return self.gets.popleft()

    def post(self, url: str, **kwargs: object):
        self.calls.append(("POST", str(url), kwargs))
        response = self.posts.popleft()
        if isinstance(response, Exception):
            raise response
        return response

    def request(self, method: str, url: str, **kwargs: object):
        self.calls.append((method, str(url), kwargs))
        response = self.requests.popleft()
        if isinstance(response, Exception):
            raise response
        return response


class TestLimitedBodyRead(unittest.IsolatedAsyncioTestCase):
    async def test_reads_all_chunks_until_eof(self):
        body = b"a" * (70 * 1024)
        response = FakeResponse(body=body)

        result = await _read_limited_body(response, len(body), operation="测试")

        self.assertEqual(result, body)

    async def test_rejects_body_over_limit(self):
        response = FakeResponse(body=b"too-large")

        with self.assertRaisesRegex(PortalProtocolError, "响应过大"):
            await _read_limited_body(response, 4, operation="测试")


class TestProtectedSsoRequests(unittest.IsolatedAsyncioTestCase):
    @patch("campus_net.aggregate.secrets.choice", return_value="A")
    def test_reproduces_frontend_csrf_header_algorithm(self, choice):
        headers = _protected_sso_headers()
        csrf_key = "A" * 32
        encoded_key = base64.b64encode(csrf_key.encode("ascii")).decode("ascii")
        midpoint = len(encoded_key) // 2
        csrf_source = encoded_key[:midpoint] + encoded_key + encoded_key[midpoint:]
        expected_value = hashlib.md5(
            csrf_source.encode("ascii"),
            usedforsecurity=False,
        ).hexdigest()

        self.assertEqual(headers["Csrf-Key"], csrf_key)
        self.assertEqual(headers["Csrf-Value"], expected_value)
        self.assertEqual(headers["sid-language"], "zh-CN")
        self.assertEqual(choice.call_count, 32)

    async def test_rejects_business_unauthorized_captcha_policy(self):
        session = FakeSession(
            gets=[FakeResponse(payload={"code": 401, "data": {"errorMessage": "unauthorized"}})]
        )

        with self.assertRaisesRegex(PortalProtocolError, "业务状态不是 200：401"):
            await AggregatePortalClient(session, config())._get_captcha_requirement(
                "example-student"
            )

        _method, url, kwargs = session.calls[0]
        self.assertIn("?", url)
        self.assertIn("Csrf-Key", kwargs["headers"])
        self.assertIn("Csrf-Value", kwargs["headers"])


class TestPortalInitialization(unittest.IsolatedAsyncioTestCase):
    async def test_preserves_exact_captive_url_and_follows_portal_main(self):
        portal_main = (
            "/portal/portal-main?sessionId=session-123&customPageId=custom-1"
            "&nasIp=nas-token&userIp=user-token&userMac=mac-token"
        )
        session = FakeSession(
            gets=[
                FakeResponse(body=captive_body()),
                FakeResponse(status=302, headers={"Location": portal_main}),
                FakeResponse(body=b"portal-spa"),
            ],
            requests=[
                FakeResponse(payload={"code": 200, "data": {"ipAddr": "10.0.0.2"}}),
                FakeResponse(payload={"code": 200, "data": {}}),
                FakeResponse(payload={"code": 200, "data": {"currentNodePath": "authenticate"}}),
            ],
        )

        result = await AggregatePortalClient(session, config()).initialize()

        self.assertEqual(result.probe.state, NetworkState.CAPTIVE)
        self.assertIsNotNone(result.context)
        self.assertEqual(result.context.session_id, "session-123")
        self.assertEqual(session.calls[1][1], captive_url())
        self.assertEqual(session.calls[2][1], PORTAL_ORIGIN + portal_main)


class TestSsoAuthentication(unittest.IsolatedAsyncioTestCase):
    async def test_reloads_form_when_captcha_code_is_on_keyless_error_page(self):
        session = FakeSession(
            gets=[
                FakeResponse(body=sso_page(CRYPTO_KEY_1, "execution-1")),
                FakeResponse(payload={"code": 200, "data": {"captchaInvisible": False}}),
                FakeResponse(payload={"code": 200, "data": {"captchaInvisible": False}}),
                FakeResponse(body=sso_page(CRYPTO_KEY_2, "execution-2")),
                FakeResponse(
                    payload={
                        "code": 200,
                        "data": {
                            "captchaInvisible": True,
                            "captchaUrl": "/sam-sso/api/captcha/reloaded",
                        },
                    }
                ),
                FakeResponse(headers={"Content-Type": "image/png"}, body=b"captcha"),
                FakeResponse(body=b"success-callback"),
            ],
            posts=[
                FakeResponse(body=b'<p id="login-error-msg">1320007</p>'),
                FakeResponse(
                    status=302,
                    headers={"Location": "/portal/assets/auth-success.html?ticket=ticket-1"},
                ),
            ],
        )

        await AggregatePortalClient(session, config()).authenticate(
            PortalContext(
                session_id="session-123",
                custom_page_id="custom-1",
                nas_ip="nas-token",
                user_ip="user-token",
                user_mac="mac-token",
                current_node_path="authenticate",
            ),
            username="example-student",
            password="example-password",
            captcha_provider=AsyncMock(return_value="abcd"),
        )

        post_forms = [kwargs["data"] for method, _url, kwargs in session.calls if method == "POST"]
        self.assertEqual(
            [value for key, value in post_forms[1] if key == "execution"],
            ["execution-2"],
        )

    async def test_uses_default_then_username_policy_and_retries_only_captcha_error(self):
        session = FakeSession(
            gets=[
                FakeResponse(body=sso_page(CRYPTO_KEY_1, "execution-1")),
                FakeResponse(
                    payload={
                        "code": 200,
                        "data": {"captchaInvisible": False, "captchaUrl": ""},
                    }
                ),
                FakeResponse(
                    payload={
                        "code": 200,
                        "data": {
                            "captchaInvisible": True,
                            "captchaUrl": "/sam-sso/api/captcha/first",
                        },
                    }
                ),
                FakeResponse(headers={"Content-Type": "image/png"}, body=b"first-image"),
                FakeResponse(
                    payload={
                        "code": 200,
                        "data": {
                            "captchaInvisible": True,
                            "captchaUrl": "/sam-sso/api/captcha/second",
                        },
                    }
                ),
                FakeResponse(headers={"Content-Type": "image/png"}, body=b"second-image"),
                FakeResponse(body=b"success-callback"),
            ],
            posts=[
                FakeResponse(body=sso_page(CRYPTO_KEY_2, "execution-2", error_code="1320007")),
                FakeResponse(
                    status=302,
                    headers={"Location": "/portal/assets/auth-success.html?ticket=ticket-1"},
                ),
            ],
        )
        codes = deque(["wrong", "right"])

        async def provide_captcha(image: bytes, content_type: str) -> str:
            self.assertEqual(content_type, "image/png")
            self.assertIn(image, {b"first-image", b"second-image"})
            return codes.popleft()

        await AggregatePortalClient(session, config()).authenticate(
            PortalContext(
                session_id="session-123",
                custom_page_id="custom-1",
                nas_ip="nas-token",
                user_ip="user-token",
                user_mac="mac-token",
                current_node_path="authenticate",
            ),
            username="example-student",
            password="example-password",
            captcha_provider=provide_captcha,
        )

        policy_urls = [url for method, url, _kwargs in session.calls if "findCaptchaCount" in url]
        policy_paths = [urlparse(url).path for url in policy_urls]
        self.assertTrue(policy_paths[0].endswith("/DEFAULT_CAPTCHA_SWITCH"))
        self.assertTrue(policy_paths[1].endswith("/example-student"))
        self.assertTrue(policy_paths[2].endswith("/example-student"))
        post_forms = [kwargs["data"] for method, _url, kwargs in session.calls if method == "POST"]
        self.assertEqual(
            [value for key, value in post_forms[0] if key == "execution"],
            ["execution-1"],
        )
        self.assertEqual(
            [value for key, value in post_forms[1] if key == "execution"],
            ["execution-2"],
        )

    async def test_does_not_replay_uncertain_login_post(self):
        session = FakeSession(
            gets=[
                FakeResponse(body=sso_page(CRYPTO_KEY_1, "execution-1")),
                FakeResponse(
                    payload={
                        "code": 200,
                        "data": {"captchaInvisible": False, "captchaUrl": ""},
                    }
                ),
                FakeResponse(
                    payload={
                        "code": 200,
                        "data": {"captchaInvisible": False, "captchaUrl": ""},
                    }
                ),
            ],
            posts=[aiohttp.ClientConnectionError("connection lost")],
        )

        with self.assertRaisesRegex(RuntimeError, "未自动重放"):
            await AggregatePortalClient(session, config()).authenticate(
                PortalContext(
                    session_id="session-123",
                    custom_page_id="custom-1",
                    nas_ip="nas-token",
                    user_ip="user-token",
                    user_mac="mac-token",
                    current_node_path="authenticate",
                ),
                username="example-student",
                password="example-password",
                captcha_provider=AsyncMock(return_value=""),
            )

        self.assertEqual(sum(method == "POST" for method, _url, _kwargs in session.calls), 1)

    async def test_treats_malformed_post_response_as_uncertain_without_replay(self):
        session = FakeSession(
            gets=[
                FakeResponse(body=sso_page(CRYPTO_KEY_1, "execution-1")),
                FakeResponse(
                    payload={
                        "code": 200,
                        "data": {"captchaInvisible": False, "captchaUrl": ""},
                    }
                ),
                FakeResponse(
                    payload={
                        "code": 200,
                        "data": {"captchaInvisible": False, "captchaUrl": ""},
                    }
                ),
            ],
            posts=[FakeResponse(body=b"not-an-sso-page")],
        )

        with self.assertRaises(AuthenticationUncertain):
            await AggregatePortalClient(session, config()).authenticate(
                PortalContext(
                    session_id="session-123",
                    custom_page_id="custom-1",
                    nas_ip="nas-token",
                    user_ip="user-token",
                    user_mac="mac-token",
                    current_node_path="authenticate",
                ),
                username="example-student",
                password="example-password",
                captcha_provider=AsyncMock(return_value=""),
            )

        self.assertEqual(sum(method == "POST" for method, _url, _kwargs in session.calls), 1)

    async def test_does_not_submit_without_image_after_explicit_captcha_error(self):
        session = FakeSession(
            gets=[
                FakeResponse(body=sso_page(CRYPTO_KEY_1, "execution-1")),
                FakeResponse(
                    payload={
                        "code": 200,
                        "data": {"captchaInvisible": False, "captchaUrl": ""},
                    }
                ),
                FakeResponse(
                    payload={
                        "code": 200,
                        "data": {
                            "captchaInvisible": True,
                            "captchaUrl": "/sam-sso/api/captcha/first",
                        },
                    }
                ),
                FakeResponse(headers={"Content-Type": "image/png"}, body=b"first-image"),
                FakeResponse(
                    payload={
                        "code": 200,
                        "data": {"captchaInvisible": False, "captchaUrl": ""},
                    }
                ),
                FakeResponse(
                    payload={
                        "code": 200,
                        "data": {"captchaInvisible": False, "captchaUrl": ""},
                    }
                ),
            ],
            posts=[FakeResponse(body=sso_page(CRYPTO_KEY_2, "execution-2", error_code="1320007"))],
        )

        with self.assertRaises(PortalProtocolError):
            await AggregatePortalClient(session, config()).authenticate(
                PortalContext(
                    session_id="session-123",
                    custom_page_id="custom-1",
                    nas_ip="nas-token",
                    user_ip="user-token",
                    user_mac="mac-token",
                    current_node_path="authenticate",
                ),
                username="example-student",
                password="example-password",
                captcha_provider=AsyncMock(return_value="wrong"),
            )

        self.assertEqual(sum(method == "POST" for method, _url, _kwargs in session.calls), 1)


class TestOnlineVerification(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_explicit_user_online_false(self):
        session = FakeSession(
            requests=[
                FakeResponse(payload={"code": 200, "data": {"online": False}}),
            ]
        )

        with self.assertRaises(AuthenticationRejected):
            await AggregatePortalClient(session, config()).trigger_online_check("session-123")

    async def test_treats_unstructured_user_online_response_as_uncertain(self):
        session = FakeSession(requests=[FakeResponse(payload=None)])

        with self.assertRaises(AuthenticationUncertain):
            await AggregatePortalClient(session, config()).trigger_online_check("session-123")

        self.assertEqual(len(session.calls), 1)

    async def test_requires_portal_and_independent_probe_to_be_online(self):
        client = AggregatePortalClient(FakeSession(), config())
        client._is_portal_online = AsyncMock(return_value=True)
        captive_probe = ProbeResult(NetworkState.CAPTIVE, captive_url=captive_url())

        with patch(
            "campus_net.aggregate.probe_connectivity", AsyncMock(return_value=captive_probe)
        ):
            self.assertFalse(await client.verify_online("session-123"))

        online_probe = ProbeResult(NetworkState.ONLINE)
        with patch("campus_net.aggregate.probe_connectivity", AsyncMock(return_value=online_probe)):
            self.assertTrue(await client.verify_online("session-123"))


class TestServiceSelection(unittest.IsolatedAsyncioTestCase):
    async def test_does_not_replay_uncertain_service_login(self):
        session = FakeSession(
            requests=[
                FakeResponse(
                    payload={
                        "code": 200,
                        "data": [{"key": "中国电信", "value": "dynamic-service"}],
                    }
                ),
                aiohttp.ClientConnectionError("connection lost"),
            ]
        )

        with self.assertRaises(AuthenticationUncertain):
            await AggregatePortalClient(session, config()).select_service(
                "session-123",
                "中国电信",
            )

        service_calls = [call for call in session.calls if call[1].endswith("/serviceLogin")]
        self.assertEqual(len(service_calls), 1)


class TestIpCookieJar(unittest.IsolatedAsyncioTestCase):
    async def test_unsafe_cookie_jar_keeps_ip_host_session(self):
        cookie = SimpleCookie()
        cookie.load("SESSION=session-value; Path=/sam-sso; HttpOnly")
        safe_jar = aiohttp.CookieJar()
        unsafe_jar = aiohttp.CookieJar(unsafe=True)
        response_url = URL("http://10.71.29.181/sam-sso/login")

        safe_jar.update_cookies(cookie, response_url=response_url)
        unsafe_jar.update_cookies(cookie, response_url=response_url)

        self.assertNotIn("SESSION", safe_jar.filter_cookies(response_url))
        self.assertEqual(
            unsafe_jar.filter_cookies(response_url)["SESSION"].value,
            "session-value",
        )


if __name__ == "__main__":
    unittest.main()
