import unittest

from main import build_runtime_from_config, portal_base_url


class TestConfig(unittest.TestCase):
    def test_portal_base_url_uses_configured_origin(self):
        self.assertEqual(
            portal_base_url("https://campus.example/eportal/InterFace.do?method=login"),
            "https://campus.example/",
        )

    def test_build_runtime_uses_configured_portal(self):
        runtime = build_runtime_from_config(
            {
                "login_url": "https://campus.example/eportal/login",
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
        self.assertEqual(login_url, "https://campus.example/eportal/login")
        self.assertEqual(portal_url, "https://campus.example/")
        self.assertEqual(check_url, "https://connectivity.example/status")
        self.assertEqual(headers["Host"], "campus.example")
        self.assertEqual(headers["JSESSIONID"], "example-session")
        self.assertEqual(cookies["EPORTAL_COOKIE_USERNAME"], "example-student")
        self.assertEqual(service, "carrier")

    def test_rejects_incomplete_login_url(self):
        with self.assertRaises(ValueError):
            portal_base_url("campus.example/eportal/login")


if __name__ == "__main__":
    unittest.main()
