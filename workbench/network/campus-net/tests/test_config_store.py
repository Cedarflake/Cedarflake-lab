import hashlib
import json
import os
import traceback
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from campus_net import config_store
from campus_net.config import (
    build_captive_http_config,
    build_legacy_runtime_from_config,
)
from campus_net.config_store import (
    MAX_CONFIG_BYTES,
    CaptiveConfigV2,
    ConfigCommitUncertainError,
    ConfigFormatError,
    ConfigIntegrityError,
    ConfigRevision,
    ConfigRevisionError,
    ConfigTooLargeError,
    LegacyConfigV1,
    load_editable_config,
    save_editable_config,
)


class TestConfigStore(unittest.TestCase):
    def setUp(self):
        temporary_directory = TemporaryDirectory()
        self.addCleanup(temporary_directory.cleanup)
        self.root = Path(temporary_directory.name)
        self.config_path = self.root / "配置 文件.json"
        self.backup_directory = self.root / "CampusNet Backups"

    def test_round_trips_formal_version_2_without_trimming_password(self):
        config = self._version_2(password="  secret 密码  ")

        receipt = self._create(config)
        loaded = load_editable_config(self.config_path)
        runtime_config = build_captive_http_config(
            json.loads(self.config_path.read_text(encoding="utf-8"))
        )

        self.assertTrue(receipt.changed)
        self.assertIsNone(receipt.backup)
        self.assertEqual(loaded.config, config)
        self.assertEqual(runtime_config.password, "  secret 密码  ")
        self.assertTrue(self.config_path.read_bytes().endswith(b"\n"))

    def test_round_trips_formal_version_1_and_optional_fields(self):
        config = LegacyConfigV1(
            login_url="https://campus.example/eportal/InterFace.do?method=login",
            username="example-student",
            encrypted_password="  encrypted secret  ",
            carrier="carrier",
            user_group="student",
            session_id="session-secret",
        )

        self._create(config)
        loaded = load_editable_config(self.config_path)
        raw_config = json.loads(self.config_path.read_text(encoding="utf-8"))
        runtime = build_legacy_runtime_from_config(raw_config)

        self.assertEqual(loaded.config, config)
        self.assertEqual(runtime[4]["EPORTAL_COOKIE_PASSWORD"], "  encrypted secret  ")
        self.assertEqual(runtime[4]["EPORTAL_USER_GROUP"], "student")
        self.assertEqual(runtime[4]["JSESSIONID"], "session-secret")

    def test_rejects_duplicate_json_keys(self):
        self.config_path.write_text(
            """{
  "version": 2,
  "interface_index": 24,
  "portal_url": "http://10.71.29.181",
  "username": "student",
  "password": "first-secret",
  "password": "second-secret",
  "carrier": "中国电信"
}
""",
            encoding="utf-8",
        )

        with self.assertRaisesRegex(ConfigFormatError, "重复字段") as context:
            load_editable_config(self.config_path)

        self.assertNotIn("first-secret", str(context.exception))
        self.assertNotIn("second-secret", str(context.exception))

    def test_rejects_versionless_historical_config(self):
        self.config_path.write_text(
            json.dumps(
                {
                    "adapter": "captive-sso-http",
                    "auth": {"password": "historical-secret"},
                }
            ),
            encoding="utf-8",
        )

        with self.assertRaisesRegex(ConfigFormatError, "version=1"):
            load_editable_config(self.config_path)

    def test_rejects_config_over_size_limit(self):
        self.config_path.write_bytes(b" " * (MAX_CONFIG_BYTES + 1))

        with self.assertRaises(ConfigTooLargeError):
            load_editable_config(self.config_path)

    def test_models_and_loaded_result_hide_secrets_from_repr(self):
        legacy = LegacyConfigV1(
            login_url="https://campus.example/eportal/InterFace.do?method=login",
            username="private-student",
            encrypted_password="encrypted-private-secret",
            carrier="carrier",
            session_id="private-session",
        )
        captive = self._version_2(
            username="private-student",
            password="plain-private-secret",
        )

        self._create(captive)
        loaded = load_editable_config(self.config_path)
        representations = "\n".join((repr(legacy), repr(captive), repr(loaded)))

        for secret in (
            "private-student",
            "encrypted-private-secret",
            "private-session",
            "plain-private-secret",
        ):
            self.assertNotIn(secret, representations)

    def test_syntax_error_traceback_does_not_include_password(self):
        password = "traceback-private-secret"
        self.config_path.write_text(
            '{"version": 2, "password": "' + password + '", "carrier": "中国电信",}',
            encoding="utf-8",
        )

        try:
            load_editable_config(self.config_path)
        except ConfigFormatError as error:
            rendered_traceback = "".join(
                traceback.format_exception(type(error), error, error.__traceback__)
            )
        else:
            self.fail("invalid JSON unexpectedly loaded")

        self.assertNotIn(password, rendered_traceback)

    def test_overwrite_creates_verified_backup_before_replacement(self):
        first_config = self._version_2(password="first-secret")
        first_receipt = self._create(first_config)
        original_content = self.config_path.read_bytes()
        second_config = self._version_2(password="second-secret")

        second_receipt = save_editable_config(
            second_config,
            path=self.config_path,
            backup_dir=self.backup_directory,
            expected_revision=first_receipt.revision,
        )

        self.assertTrue(second_receipt.changed)
        self.assertIsNotNone(second_receipt.backup)
        backup = second_receipt.backup
        if backup is None:
            self.fail("overwrite did not return a backup receipt")
        self.assertEqual(backup.path.parent, self.backup_directory)
        self.assertEqual(backup.path.read_bytes(), original_content)
        self.assertEqual(backup.size, len(original_content))
        self.assertEqual(
            backup.sha256,
            hashlib.sha256(original_content).hexdigest(),
        )
        self.assertEqual(
            load_editable_config(self.config_path).config,
            second_config,
        )

    def test_identical_serialized_content_is_no_op(self):
        config = self._version_2()
        first_receipt = self._create(config)
        original_content = self.config_path.read_bytes()

        second_receipt = save_editable_config(
            config,
            path=self.config_path,
            backup_dir=self.backup_directory,
            expected_revision=first_receipt.revision,
        )

        self.assertFalse(second_receipt.changed)
        self.assertIsNone(second_receipt.backup)
        self.assertEqual(self.config_path.read_bytes(), original_content)
        self.assertFalse(self.backup_directory.exists())

    def test_revision_mismatch_never_overwrites_external_change(self):
        first_receipt = self._create(self._version_2(password="first-secret"))
        external_content = b"external editor content"
        self.config_path.write_bytes(external_content)

        with self.assertRaises(ConfigRevisionError):
            save_editable_config(
                self._version_2(password="second-secret"),
                path=self.config_path,
                backup_dir=self.backup_directory,
                expected_revision=first_receipt.revision,
            )

        self.assertEqual(self.config_path.read_bytes(), external_content)
        self.assertFalse(self.backup_directory.exists())

    def test_backup_hash_failure_leaves_original_untouched(self):
        first_receipt = self._create(self._version_2(password="first-secret"))
        original_content = self.config_path.read_bytes()

        with mock.patch.object(config_store, "_sha256_file", return_value="0" * 64):
            with self.assertRaises(ConfigIntegrityError):
                save_editable_config(
                    self._version_2(password="second-secret"),
                    path=self.config_path,
                    backup_dir=self.backup_directory,
                    expected_revision=first_receipt.revision,
                )

        self.assertEqual(self.config_path.read_bytes(), original_content)
        self.assertEqual(list(self.backup_directory.iterdir()), [])

    def test_target_temp_hash_failure_before_replace_keeps_original(self):
        first_receipt = self._create(self._version_2(password="first-secret"))
        original_content = self.config_path.read_bytes()
        original_hash = hashlib.sha256(original_content).hexdigest()
        file_hashes = iter((original_hash, original_hash, "0" * 64))

        with mock.patch.object(
            config_store,
            "_sha256_file",
            side_effect=lambda _path: next(file_hashes),
        ):
            with self.assertRaises(ConfigIntegrityError):
                save_editable_config(
                    self._version_2(password="second-secret"),
                    path=self.config_path,
                    backup_dir=self.backup_directory,
                    expected_revision=first_receipt.revision,
                )

        self.assertEqual(self.config_path.read_bytes(), original_content)
        backups = list(self.backup_directory.glob("*.backup.json"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), original_content)

    def test_target_directory_fsync_failure_reports_uncertain_commit(self):
        first_receipt = self._create(self._version_2(password="first-secret"))
        original_content = self.config_path.read_bytes()
        second_config = self._version_2(password="second-secret")
        real_fsync_directory = config_store._fsync_directory
        fsync_calls = 0

        def fail_after_target_replace(directory):
            nonlocal fsync_calls
            fsync_calls += 1
            if fsync_calls == 1:
                return real_fsync_directory(directory)
            raise OSError("simulated target directory fsync failure")

        with mock.patch.object(
            config_store,
            "_fsync_directory",
            side_effect=fail_after_target_replace,
        ):
            with self.assertRaises(ConfigCommitUncertainError) as context:
                save_editable_config(
                    second_config,
                    path=self.config_path,
                    backup_dir=self.backup_directory,
                    expected_revision=first_receipt.revision,
                )

        backup = context.exception.backup
        self.assertIsNotNone(backup)
        if backup is None:
            self.fail("uncertain commit did not expose its verified backup")
        self.assertEqual(backup.path.read_bytes(), original_content)
        self.assertEqual(backup.sha256, hashlib.sha256(original_content).hexdigest())
        self.assertEqual(load_editable_config(self.config_path).config, second_config)

    def test_final_read_failure_reports_uncertain_commit(self):
        first_receipt = self._create(self._version_2(password="first-secret"))
        original_content = self.config_path.read_bytes()
        second_config = self._version_2(password="second-secret")
        real_snapshot = config_store._snapshot
        snapshot_calls = 0

        def fail_final_snapshot(*args, **kwargs):
            nonlocal snapshot_calls
            snapshot_calls += 1
            if snapshot_calls == 3:
                raise OSError("simulated final config read failure")
            return real_snapshot(*args, **kwargs)

        with mock.patch.object(
            config_store,
            "_snapshot",
            side_effect=fail_final_snapshot,
        ):
            with self.assertRaises(ConfigCommitUncertainError) as context:
                save_editable_config(
                    second_config,
                    path=self.config_path,
                    backup_dir=self.backup_directory,
                    expected_revision=first_receipt.revision,
                )

        backup = context.exception.backup
        self.assertIsNotNone(backup)
        if backup is None:
            self.fail("uncertain commit did not expose its verified backup")
        self.assertEqual(backup.path.read_bytes(), original_content)
        self.assertEqual(backup.sha256, hashlib.sha256(original_content).hexdigest())
        self.assertEqual(load_editable_config(self.config_path).config, second_config)

    def test_target_replace_failure_keeps_original_and_verified_backup(self):
        first_receipt = self._create(self._version_2(password="first-secret"))
        original_content = self.config_path.read_bytes()
        real_replace = os.replace
        replace_calls = 0

        def fail_second_replace(source, destination):
            nonlocal replace_calls
            replace_calls += 1
            if replace_calls == 1:
                return real_replace(source, destination)
            raise OSError("simulated target replace failure")

        with mock.patch.object(config_store.os, "replace", side_effect=fail_second_replace):
            with self.assertRaisesRegex(OSError, "simulated"):
                save_editable_config(
                    self._version_2(password="second-secret"),
                    path=self.config_path,
                    backup_dir=self.backup_directory,
                    expected_revision=first_receipt.revision,
                )

        self.assertEqual(self.config_path.read_bytes(), original_content)
        backups = list(self.backup_directory.glob("*.backup.json"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), original_content)
        self.assertEqual(list(self.root.glob(".*.tmp")), [])
        self.assertEqual(list(self.backup_directory.glob("*.tmp")), [])

    def test_change_after_backup_is_detected_before_target_replace(self):
        first_receipt = self._create(self._version_2(password="first-secret"))
        original_content = self.config_path.read_bytes()
        external_content = b"external change after backup"
        real_backup = config_store._create_verified_backup

        def backup_then_change(**kwargs):
            receipt = real_backup(**kwargs)
            self.config_path.write_bytes(external_content)
            return receipt

        with mock.patch.object(
            config_store,
            "_create_verified_backup",
            side_effect=backup_then_change,
        ):
            with self.assertRaises(ConfigRevisionError):
                save_editable_config(
                    self._version_2(password="second-secret"),
                    path=self.config_path,
                    backup_dir=self.backup_directory,
                    expected_revision=first_receipt.revision,
                )

        self.assertEqual(self.config_path.read_bytes(), external_content)
        backups = list(self.backup_directory.glob("*.backup.json"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), original_content)

    def test_new_file_revision_does_not_overwrite_file_that_appeared(self):
        self.config_path.write_bytes(b"appeared externally")

        with self.assertRaises(ConfigRevisionError):
            save_editable_config(
                self._version_2(),
                path=self.config_path,
                backup_dir=self.backup_directory,
                expected_revision=ConfigRevision.absent(),
            )

        self.assertEqual(self.config_path.read_bytes(), b"appeared externally")

    def test_rejects_non_sha256_revision(self):
        with self.assertRaises(ValueError):
            ConfigRevision(exists=True, sha256="not-a-sha256")

    def _create(self, config):
        return save_editable_config(
            config,
            path=self.config_path,
            backup_dir=self.backup_directory,
            expected_revision=ConfigRevision.absent(),
        )

    @staticmethod
    def _version_2(
        *,
        username="example-student",
        password="example-password",
    ):
        return CaptiveConfigV2(
            interface_index=24,
            portal_url="http://10.71.29.181",
            username=username,
            password=password,
            carrier="中国电信",
        )


if __name__ == "__main__":
    unittest.main()
