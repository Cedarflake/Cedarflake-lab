import base64
import unittest
from urllib.parse import parse_qs, urlparse

from campus_net.sso import (
    LoginResultType,
    SsoProtocolError,
    UnsupportedSsoChallenge,
    aes_encrypt,
    build_login_form,
    build_sso_action_url,
    ensure_supported_challenge,
    parse_captcha_requirement,
    parse_login_response,
    parse_sso_page,
    resolve_captcha_url,
)
from Crypto.Cipher import AES

PAGE_URL = "http://10.71.29.181/sam-sso/login?flowSessionId=session-123&empty="
CRYPTO_KEY = base64.b64encode(b"0123456789abcdef").decode("ascii")


def login_page(
    *,
    crypto_key: str = CRYPTO_KEY,
    execution: str = "flow-key-1",
    vendor: str = "system",
    risk_switch: str = "",
    error_code: str = "",
    error_message: str = "",
) -> bytes:
    return (
        "<!doctype html><html><body>"
        f'<p id="login-croypto"><span>{crypto_key}</span></p>'
        f'<p id="login-page-flowkey">{execution}</p>'
        f'<p id="recaptchaVendor">{vendor}</p>'
        f'<p id="riskSystemSwitch">{risk_switch}</p>'
        f'<p id="login-error-code">{error_code}</p>'
        f'<p id="login-error-msg">{error_message}</p>'
        "</body></html>"
    ).encode()


def decrypt_field(ciphertext: str) -> str:
    key = base64.b64decode(CRYPTO_KEY)
    padded = AES.new(key, AES.MODE_ECB).decrypt(base64.b64decode(ciphertext))
    padding_length = padded[-1]
    return padded[:-padding_length].decode("utf-8")


class TestSsoPage(unittest.TestCase):
    def test_parses_dynamic_fields_and_preserves_blank_query(self):
        page = parse_sso_page(login_page(), PAGE_URL)

        self.assertEqual(page.crypto_key, CRYPTO_KEY)
        self.assertEqual(page.execution, "flow-key-1")
        self.assertEqual(page.recaptcha_vendor, "system")
        action_query = parse_qs(urlparse(page.action_url).query, keep_blank_values=True)
        self.assertEqual(action_query["flowSessionId"], ["session-123"])
        self.assertEqual(action_query["empty"], [""])
        self.assertEqual(action_query["accept-language"], ["zh-CN"])

    def test_rejects_missing_invalid_and_duplicate_crypto_metadata(self):
        invalid_pages = {
            "missing": b'<p id="login-page-flowkey">flow</p>',
            "invalid-base64": login_page(crypto_key="not-base64"),
            "wrong-size": login_page(crypto_key=base64.b64encode(b"too-short").decode("ascii")),
            "duplicate": login_page() + f'<p id="login-croypto">{CRYPTO_KEY}</p>'.encode(),
        }
        for name, body in invalid_pages.items():
            with self.subTest(name=name), self.assertRaises(SsoProtocolError):
                parse_sso_page(body, PAGE_URL)

    def test_rejects_third_party_and_fingerprint_challenges(self):
        for vendor, risk_switch in (("geetest", ""), ("google", ""), ("system", "USTC")):
            with self.subTest(vendor=vendor, risk_switch=risk_switch):
                page = parse_sso_page(
                    login_page(vendor=vendor, risk_switch=risk_switch),
                    PAGE_URL,
                )
                with self.assertRaises(UnsupportedSsoChallenge):
                    ensure_supported_challenge(page)


class TestCaptchaRelationship(unittest.TestCase):
    def test_parses_required_system_captcha(self):
        requirement = parse_captcha_requirement(
            {
                "data": {
                    "captchaInvisible": True,
                    "captchaUrl": "/sam-sso/api/captcha/current",
                }
            }
        )

        self.assertTrue(requirement.required)
        self.assertEqual(requirement.image_path, "/sam-sso/api/captcha/current")

    def test_rejects_required_captcha_without_image(self):
        with self.assertRaises(SsoProtocolError):
            parse_captcha_requirement({"data": {"captchaInvisible": True}})

    def test_treats_empty_default_policy_as_not_required(self):
        self.assertFalse(parse_captcha_requirement({"data": {}}).required)
        self.assertFalse(parse_captcha_requirement({}).required)

    def test_resolves_only_same_origin_sam_sso_image(self):
        self.assertEqual(
            resolve_captcha_url(PAGE_URL, "/sam-sso/api/captcha/current"),
            "http://10.71.29.181/sam-sso/api/captcha/current",
        )
        self.assertEqual(
            resolve_captcha_url(PAGE_URL, "api/captcha/current"),
            "http://10.71.29.181/sam-sso/api/captcha/current",
        )
        self.assertEqual(
            resolve_captcha_url(PAGE_URL, "/sso/api/captcha/current"),
            "http://10.71.29.181/sso/api/captcha/current",
        )
        for image_path in (
            "http://example.test/sam-sso/api/captcha/current",
            "/ssoevil/api/captcha/current",
            "/portal/other",
        ):
            with self.subTest(image_path=image_path), self.assertRaises(SsoProtocolError):
                resolve_captcha_url(PAGE_URL, image_path)

    def test_form_keeps_code_plain_and_encrypts_only_payload_and_password(self):
        page = parse_sso_page(login_page(), PAGE_URL)

        form = build_login_form(
            page,
            username="example-student",
            password="example-password",
            captcha_code="a1b2",
            captcha_required=True,
        )

        self.assertEqual([value for key, value in form if key == "captcha_code"], ["a1b2", "a1b2"])
        encrypted_password = next(value for key, value in form if key == "password")
        encrypted_payload = next(value for key, value in form if key == "captcha_payload")
        self.assertEqual(decrypt_field(encrypted_password), "example-password")
        self.assertEqual(decrypt_field(encrypted_payload), "{}")
        self.assertEqual(next(value for key, value in form if key == "croypto"), CRYPTO_KEY)

    def test_aes_uses_pkcs7_even_for_full_block(self):
        ciphertext = aes_encrypt(CRYPTO_KEY, "1234567890abcdef")

        self.assertEqual(decrypt_field(ciphertext), "1234567890abcdef")


class TestLoginResponse(unittest.TestCase):
    def test_accepts_exact_success_callback_with_default_port_equivalence(self):
        result = parse_login_response(
            status=302,
            headers={
                "Location": "http://10.71.29.181:80/portal/assets/auth-success.html?ticket=t-1"
            },
            body=b"",
            page_url=PAGE_URL,
        )

        self.assertEqual(result.result_type, LoginResultType.SUCCESS)
        self.assertIsNotNone(result.redirect_url)

    def test_rejects_ambiguous_or_cross_origin_success_callback(self):
        locations = (
            "/portal/assets/auth-success.html?ticket=one&ticket=two",
            "http://example.test/portal/assets/auth-success.html?ticket=one",
            "/portal/assets/auth-success.html?ticket=one#fragment",
            "/portal/assets/auth-success.html;unexpected?ticket=one",
        )
        for location in locations:
            with self.subTest(location=location):
                result = parse_login_response(
                    status=302,
                    headers={"Location": location},
                    body=b"",
                    page_url=PAGE_URL,
                )
                self.assertEqual(result.result_type, LoginResultType.UNKNOWN)

    def test_recognizes_only_explicit_captcha_error_as_retryable(self):
        captcha_error = parse_login_response(
            status=200,
            headers={},
            body=login_page(error_code="1320007", error_message="captcha"),
            page_url=PAGE_URL,
        )
        credentials_error = parse_login_response(
            status=200,
            headers={},
            body=login_page(error_code="other", error_message="credentials"),
            page_url=PAGE_URL,
        )

        self.assertEqual(captcha_error.result_type, LoginResultType.CAPTCHA_ERROR)
        self.assertEqual(credentials_error.result_type, LoginResultType.FAILURE)
        self.assertEqual(credentials_error.error_message, "credentials")

    def test_recognizes_captcha_code_in_message_without_next_form(self):
        result = parse_login_response(
            status=200,
            headers={},
            body=b'<p id="login-error-msg">1320007</p>',
            page_url=PAGE_URL,
        )

        self.assertEqual(result.result_type, LoginResultType.CAPTCHA_ERROR)
        self.assertIsNone(result.next_page)


class TestActionUrl(unittest.TestCase):
    def test_replaces_existing_language_once(self):
        action_url = build_sso_action_url(
            PAGE_URL + "&accept-language=en-US",
            language="zh-CN",
        )

        query = parse_qs(urlparse(action_url).query, keep_blank_values=True)
        self.assertEqual(query["accept-language"], ["zh-CN"])


if __name__ == "__main__":
    unittest.main()
