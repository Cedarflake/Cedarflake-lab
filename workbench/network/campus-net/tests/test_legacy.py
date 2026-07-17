import unittest

from campus_net.legacy import _sanitize_portal_message


class TestPortalMessageSanitization(unittest.TestCase):
    def test_redacts_account_password_and_session(self):
        message = "account student-01 password cipher-value session session-token"

        sanitized = _sanitize_portal_message(
            message,
            "student-01",
            "cipher-value",
            "session-token",
        )

        self.assertNotIn("student-01", sanitized)
        self.assertNotIn("cipher-value", sanitized)
        self.assertNotIn("session-token", sanitized)
        self.assertEqual(sanitized.count("[已隐藏]"), 3)

    def test_normalizes_whitespace_and_limits_length(self):
        sanitized = _sanitize_portal_message("  line one\n" + "x" * 300)

        self.assertTrue(sanitized.startswith("line one "))
        self.assertEqual(len(sanitized), 240)


if __name__ == "__main__":
    unittest.main()
