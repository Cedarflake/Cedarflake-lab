import json
import unittest
from pathlib import Path

from campus_net.config import (
    ADAPTER_CAPTIVE_SSO_HTTP,
    CONFIG_VERSION_CAPTIVE_SSO,
    DEFAULT_AUTH_MODE,
    DEFAULT_CAPTIVE_PROBE_BODY,
    DEFAULT_CAPTIVE_PROBE_URL,
    DEFAULT_PORTAL_ENTRY_PATH,
    DEFAULT_USER_AGENT,
    build_captive_http_config,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def valid_config() -> dict[str, object]:
    return {
        "version": CONFIG_VERSION_CAPTIVE_SSO,
        "interface_index": 24,
        "portal_url": "http://10.71.29.181",
        "username": "example-student",
        "password": "example-password",
        "carrier": "中国电信",
    }


def historical_nested_captive_config() -> dict[str, object]:
    return {
        "adapter": ADAPTER_CAPTIVE_SSO_HTTP,
        "network": {
            "interface_index": 24,
            "probe": {
                "url": "http://connectivity.example/connecttest.txt",
                "online_status": 200,
                "online_body": "Legacy Connect Test",
            },
        },
        "portal": {
            "origin": "http://10.71.29.181",
            "entry_path": "/eportal/index.jsp",
        },
        "auth": {
            "mode": "interactive-system-captcha",
            "username": "example-student",
            "password": "example-password",
            "service_display_name": "中国电信",
        },
    }


class TestCaptiveHttpConfig(unittest.TestCase):
    def test_builds_version_2_config_with_internal_defaults(self):
        config = build_captive_http_config(valid_config())

        self.assertEqual(config.adapter, ADAPTER_CAPTIVE_SSO_HTTP)
        self.assertEqual(config.interface_index, 24)
        self.assertEqual(config.user_agent, DEFAULT_USER_AGENT)
        self.assertEqual(config.probe.url, DEFAULT_CAPTIVE_PROBE_URL)
        self.assertEqual(config.probe.online_status, 200)
        self.assertEqual(config.probe.online_body, DEFAULT_CAPTIVE_PROBE_BODY)
        self.assertIsNone(config.probe.online_location)
        self.assertEqual(config.probe.timeout_seconds, 8)
        self.assertEqual(config.portal_origin, "http://10.71.29.181")
        self.assertEqual(config.portal_entry_path, DEFAULT_PORTAL_ENTRY_PATH)
        self.assertEqual(config.auth_mode, DEFAULT_AUTH_MODE)
        self.assertEqual(config.username, "example-student")
        self.assertEqual(config.password, "example-password")
        self.assertEqual(config.service_display_name, "中国电信")
        self.assertEqual(config.captcha_attempts, 0)
        self.assertEqual(config.verification_interval_seconds, 2)
        self.assertEqual(config.verification_timeout_seconds, 30)

    def test_captive_example_matches_parser(self):
        raw_config = json.loads((PROJECT_ROOT / "config.example.json").read_text(encoding="utf-8"))

        config = build_captive_http_config(raw_config)

        self.assertEqual(config.interface_index, 24)
        self.assertEqual(config.portal_origin, "http://10.71.29.181")
        self.assertEqual(config.service_display_name, "中国电信")

    def test_keeps_historical_nested_captive_config_compatible(self):
        config = build_captive_http_config(historical_nested_captive_config())

        self.assertEqual(
            config.probe.url,
            "http://connectivity.example/connecttest.txt",
        )
        self.assertEqual(config.probe.online_body, "Legacy Connect Test")
        self.assertEqual(config.username, "example-student")
        self.assertEqual(config.password, "example-password")

    def test_version_2_rejects_unknown_or_legacy_fields(self):
        for field, value in {
            "adapter": ADAPTER_CAPTIVE_SSO_HTTP,
            "network": {},
            "portal": {},
            "auth": {},
            "timeout_seconds": 30,
            "schema_version": 2,
            "mode": "captive-sso",
        }.items():
            with self.subTest(field=field):
                raw_config = valid_config()
                raw_config[field] = value

                with self.assertRaisesRegex(ValueError, field):
                    build_captive_http_config(raw_config)

    def test_flat_config_requires_version(self):
        raw_config = valid_config()
        del raw_config["version"]

        with self.assertRaisesRegex(ValueError, "必须提供 version"):
            build_captive_http_config(raw_config)

    def test_rejects_invalid_or_unknown_version(self):
        for version in (True, 0, 3, "2"):
            with self.subTest(version=version):
                raw_config = valid_config()
                raw_config["version"] = version

                with self.assertRaises((TypeError, ValueError)):
                    build_captive_http_config(raw_config)

    def test_version_2_rejects_legacy_password_field(self):
        raw_config = valid_config()
        del raw_config["password"]
        raw_config["encrypted_password"] = "legacy-password"

        with self.assertRaisesRegex(ValueError, "encrypted_password"):
            build_captive_http_config(raw_config)

    def test_rejects_boolean_interface_index(self):
        raw_config = valid_config()
        raw_config["interface_index"] = True

        with self.assertRaises(TypeError):
            build_captive_http_config(raw_config)

    def test_rejects_interface_index_outside_windows_range(self):
        for interface_index in (0, 0x1_0000_0000):
            with self.subTest(interface_index=interface_index):
                raw_config = valid_config()
                raw_config["interface_index"] = interface_index

                with self.assertRaises(ValueError):
                    build_captive_http_config(raw_config)

    def test_version_2_rejects_deep_portal_url(self):
        raw_config = valid_config()
        raw_config["portal_url"] = "http://10.71.29.181/sam-sso/login"

        with self.assertRaisesRegex(ValueError, "portal_url"):
            build_captive_http_config(raw_config)

    def test_password_preserves_whitespace_without_exposing_repr(self):
        raw_config = valid_config()
        raw_config["password"] = "  example-password  "

        config = build_captive_http_config(raw_config)

        self.assertEqual(config.password, "  example-password  ")
        self.assertNotIn("example-password", repr(config))

    def test_v1_rejects_https_probe(self):
        raw_config = historical_nested_captive_config()
        raw_config["network"]["probe"]["url"] = "https://connectivity.example/connecttest.txt"

        with self.assertRaises(ValueError):
            build_captive_http_config(raw_config)

    def test_v1_rejects_unknown_auth_mode(self):
        raw_config = historical_nested_captive_config()
        raw_config["auth"]["mode"] = "automatic"

        with self.assertRaises(ValueError):
            build_captive_http_config(raw_config)

    def test_v1_zero_captcha_attempts_means_no_client_limit(self):
        raw_config = historical_nested_captive_config()
        raw_config["auth"]["captcha_attempts"] = 0

        config = build_captive_http_config(raw_config)

        self.assertEqual(config.captcha_attempts, 0)

    def test_v1_rejects_removed_password_environment_field(self):
        raw_config = historical_nested_captive_config()
        del raw_config["auth"]["password"]
        raw_config["auth"]["password_env"] = "CAMPUSNET_PASSWORD"

        with self.assertRaisesRegex(ValueError, "auth.password_env"):
            build_captive_http_config(raw_config)


if __name__ == "__main__":
    unittest.main()
