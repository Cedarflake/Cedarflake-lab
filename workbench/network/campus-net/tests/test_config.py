import json
import unittest
from pathlib import Path

from campus_net.config import (
    ADAPTER_CAPTIVE_SSO_HTTP,
    ADAPTER_LEGACY_EPORTAL,
    CONFIG_VERSION_CAPTIVE_SSO,
    CONFIG_VERSION_LEGACY_EPORTAL,
    DEFAULT_CONNECTIVITY_CHECK_URL,
    build_legacy_runtime_from_config,
    get_adapter,
    portal_base_url,
)
from campus_net.legacy import is_network_available

PROJECT_ROOT = Path(__file__).resolve().parents[1]


class TestConfig(unittest.TestCase):
    def test_portal_base_url_uses_configured_origin(self):
        self.assertEqual(
            portal_base_url("https://campus.example/eportal/InterFace.do?method=login"),
            "https://campus.example/",
        )

    def test_build_runtime_uses_configured_portal(self):
        runtime = build_legacy_runtime_from_config(
            {
                "login_url": ("https://campus.example/eportal/InterFace.do?method=login"),
                "connectivity_check_url": "https://connectivity.example/status",
                "service": "carrier",
                "cookies": {
                    "EPORTAL_COOKIE_USERNAME": "example-student",
                    "EPORTAL_COOKIE_PASSWORD": "example-encrypted-password",
                    "JSESSIONID": "example-session",
                },
            }
        )

        login_url, portal_url, check_url, headers, cookies, service = runtime
        self.assertEqual(
            login_url,
            "https://campus.example/eportal/InterFace.do?method=login",
        )
        self.assertEqual(portal_url, "https://campus.example/")
        self.assertEqual(check_url, "https://connectivity.example/status")
        self.assertEqual(headers["Host"], "campus.example")
        self.assertEqual(headers["JSESSIONID"], "example-session")
        self.assertEqual(cookies["EPORTAL_COOKIE_USERNAME"], "example-student")
        self.assertEqual(service, "carrier")

    def test_builds_version_1_legacy_runtime(self):
        runtime = build_legacy_runtime_from_config(
            {
                "version": CONFIG_VERSION_LEGACY_EPORTAL,
                "login_url": ("https://campus.example/eportal/InterFace.do?method=login"),
                "username": "example-student",
                "encrypted_password": "  encrypted-password  ",
                "carrier": "%E4%B8%AD%E5%9B%BD%E7%94%B5%E4%BF%A1",
                "user_group": "student",
                "session_id": "example-session",
            }
        )

        login_url, portal_url, check_url, headers, cookies, service = runtime
        self.assertEqual(
            login_url,
            "https://campus.example/eportal/InterFace.do?method=login",
        )
        self.assertEqual(portal_url, "https://campus.example/")
        self.assertEqual(check_url, DEFAULT_CONNECTIVITY_CHECK_URL)
        self.assertEqual(headers["Host"], "campus.example")
        self.assertEqual(headers["JSESSIONID"], "example-session")
        self.assertEqual(cookies["EPORTAL_COOKIE_USERNAME"], "example-student")
        self.assertEqual(
            cookies["EPORTAL_COOKIE_PASSWORD"],
            "  encrypted-password  ",
        )
        self.assertEqual(cookies["EPORTAL_USER_GROUP"], "student")
        self.assertEqual(cookies["JSESSIONID"], "example-session")
        self.assertEqual(service, "%E4%B8%AD%E5%9B%BD%E7%94%B5%E4%BF%A1")

    def test_version_1_legacy_optional_fields_can_be_omitted(self):
        runtime = build_legacy_runtime_from_config(
            {
                "version": CONFIG_VERSION_LEGACY_EPORTAL,
                "login_url": ("https://campus.example/eportal/InterFace.do?method=login"),
                "username": "example-student",
                "encrypted_password": "encrypted-password",
                "carrier": "carrier",
            }
        )

        headers = runtime[3]
        cookies = runtime[4]
        self.assertNotIn("JSESSIONID", headers)
        self.assertNotIn("JSESSIONID", cookies)
        self.assertNotIn("EPORTAL_USER_GROUP", cookies)

    def test_version_maps_to_internal_adapter(self):
        self.assertEqual(
            get_adapter(
                {
                    "version": CONFIG_VERSION_CAPTIVE_SSO,
                }
            ),
            ADAPTER_CAPTIVE_SSO_HTTP,
        )
        self.assertEqual(
            get_adapter(
                {
                    "version": CONFIG_VERSION_LEGACY_EPORTAL,
                }
            ),
            ADAPTER_LEGACY_EPORTAL,
        )

    def test_config_without_adapter_remains_legacy(self):
        self.assertEqual(get_adapter({}), ADAPTER_LEGACY_EPORTAL)

    def test_version_1_legacy_rejects_unknown_fields(self):
        raw_config = {
            "version": CONFIG_VERSION_LEGACY_EPORTAL,
            "login_url": "https://campus.example/eportal/InterFace.do?method=login",
            "username": "example-student",
            "encrypted_password": "encrypted-password",
            "carrier": "carrier",
            "headers": {},
        }

        with self.assertRaisesRegex(ValueError, "headers"):
            build_legacy_runtime_from_config(raw_config)

    def test_version_1_legacy_rejects_plain_password_field(self):
        raw_config = {
            "version": CONFIG_VERSION_LEGACY_EPORTAL,
            "login_url": "https://campus.example/eportal/InterFace.do?method=login",
            "username": "example-student",
            "password": "plain-password",
            "carrier": "carrier",
        }

        with self.assertRaisesRegex(ValueError, "encrypted_password"):
            build_legacy_runtime_from_config(raw_config)

    def test_version_1_legacy_rejects_control_characters_in_session_id(self):
        for session_id in ("unsafe\r\nsession", "unsafe-session\r\n"):
            with self.subTest(session_id=repr(session_id)):
                raw_config = {
                    "version": CONFIG_VERSION_LEGACY_EPORTAL,
                    "login_url": ("https://campus.example/eportal/InterFace.do?method=login"),
                    "username": "example-student",
                    "encrypted_password": "encrypted-password",
                    "carrier": "carrier",
                    "session_id": session_id,
                }

                with self.assertRaisesRegex(ValueError, "控制字符"):
                    build_legacy_runtime_from_config(raw_config)

    def test_version_1_legacy_requires_eportal_login_endpoint(self):
        for login_url in (
            "https://campus.example/not-eportal",
            "https://campus.example/eportal/InterFace.do?method=logout",
            "https://campus.example/eportal/InterFace.do",
        ):
            with self.subTest(login_url=login_url):
                raw_config = {
                    "version": CONFIG_VERSION_LEGACY_EPORTAL,
                    "login_url": login_url,
                    "username": "example-student",
                    "encrypted_password": "encrypted-password",
                    "carrier": "carrier",
                }

                with self.assertRaisesRegex(ValueError, "InterFace.do"):
                    build_legacy_runtime_from_config(raw_config)

    def test_legacy_example_matches_parser(self):
        raw_config = json.loads(
            (PROJECT_ROOT / "config.legacy.example.json").read_text(encoding="utf-8")
        )

        runtime = build_legacy_runtime_from_config(raw_config)

        self.assertEqual(runtime[0], raw_config["login_url"])
        self.assertEqual(runtime[4]["EPORTAL_COOKIE_USERNAME"], raw_config["username"])

    def test_rejects_incomplete_login_url(self):
        with self.assertRaises(ValueError):
            portal_base_url("campus.example/eportal/login")

    def test_build_runtime_uses_configured_user_group(self):
        runtime = build_legacy_runtime_from_config(
            {
                "login_url": "https://campus.example/eportal/login",
                "user_group": "student",
                "cookies": {},
            }
        )

        self.assertEqual(runtime[4]["EPORTAL_USER_GROUP"], "student")

    def test_explicit_cookie_user_group_takes_precedence(self):
        runtime = build_legacy_runtime_from_config(
            {
                "login_url": "https://campus.example/eportal/login",
                "user_group": "student",
                "cookies": {"EPORTAL_USER_GROUP": "teacher"},
            }
        )

        self.assertEqual(runtime[4]["EPORTAL_USER_GROUP"], "teacher")

    def test_connectivity_check_rejects_error_status(self):
        self.assertFalse(is_network_available(500, "upstream error", "", "campus.example"))

    def test_connectivity_check_rejects_portal_redirect(self):
        self.assertFalse(
            is_network_available(
                302,
                "",
                "https://campus.example/eportal/login",
                "campus.example",
            )
        )

    def test_connectivity_check_accepts_success_without_portal(self):
        self.assertTrue(is_network_available(204, "", "", "campus.example"))


if __name__ == "__main__":
    unittest.main()
