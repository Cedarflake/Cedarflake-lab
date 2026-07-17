import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from campus_net.config_paths import (
    config_candidates,
    preferred_config_path,
    resolve_config_path,
)


class TestConfigCandidates(unittest.TestCase):
    def test_source_mode_uses_explicit_cwd_source_and_bundle_order(self):
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            explicit = root / "chosen.json"
            cwd = root / "working"
            source_root = root / "source"
            bundle = root / "bundle"

            candidates = list(
                config_candidates(
                    configured_path=explicit,
                    frozen=False,
                    executable=root / "ignored" / "CampusNet.exe",
                    cwd=cwd,
                    source_root=source_root,
                    bundled_directory=bundle,
                )
            )

            self.assertEqual(
                candidates,
                [
                    explicit.absolute(),
                    (cwd / "config.json").absolute(),
                    (source_root / "config.json").absolute(),
                    (bundle / "config.json").absolute(),
                ],
            )

    def test_frozen_dist_mode_includes_executable_and_project_directories(self):
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            explicit = root / "chosen.json"
            executable = root / "project" / "dist" / "CampusNet.exe"
            cwd = root / "working"
            bundle = root / "bundle"
            executable.parent.mkdir(parents=True)
            (executable.parent.parent / "pyproject.toml").write_text(
                "[project]\n",
                encoding="utf-8",
            )
            (executable.parent.parent / "config.example.json").write_text(
                "{}\n",
                encoding="utf-8",
            )

            candidates = list(
                config_candidates(
                    configured_path=explicit,
                    frozen=True,
                    executable=executable,
                    cwd=cwd,
                    source_root=root / "ignored-source",
                    bundled_directory=bundle,
                )
            )

            self.assertEqual(
                candidates,
                [
                    explicit.absolute(),
                    (cwd / "config.json").absolute(),
                    (executable.parent / "config.json").absolute(),
                    (executable.parent.parent / "config.json").absolute(),
                    (bundle / "config.json").absolute(),
                ],
            )

    def test_frozen_non_dist_mode_does_not_guess_executable_parent_parent(self):
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            executable = root / "installed" / "CampusNet.exe"

            candidates = list(
                config_candidates(
                    configured_path="",
                    frozen=True,
                    executable=executable,
                    cwd=root / "working",
                    source_root=root / "ignored-source",
                    bundled_directory=None,
                )
            )

            self.assertEqual(
                candidates,
                [
                    (root / "working" / "config.json").absolute(),
                    (executable.parent / "config.json").absolute(),
                ],
            )
            self.assertNotIn((root / "config.json").absolute(), candidates)

    def test_deduplicates_candidates_without_changing_first_seen_order(self):
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            dist = root / "dist"
            config_path = dist / "config.json"
            dist.mkdir()
            (root / "pyproject.toml").write_text("[project]\n", encoding="utf-8")
            (root / "config.example.json").write_text("{}\n", encoding="utf-8")

            candidates = list(
                config_candidates(
                    configured_path=config_path,
                    frozen=True,
                    executable=dist / "CampusNet.exe",
                    cwd=dist,
                    source_root=root,
                    bundled_directory=dist,
                )
            )

            self.assertEqual(
                candidates,
                [
                    config_path.absolute(),
                    (root / "config.json").absolute(),
                ],
            )

    def test_frozen_dist_mode_does_not_search_parent_without_both_project_markers(self):
        for present_marker in (None, "pyproject.toml", "config.example.json"):
            with self.subTest(present_marker=present_marker):
                with TemporaryDirectory() as temporary_directory:
                    root = Path(temporary_directory)
                    dist = root / "dist"
                    dist.mkdir()
                    if present_marker is not None:
                        (root / present_marker).write_text("marker\n", encoding="utf-8")

                    candidates = list(
                        config_candidates(
                            configured_path="",
                            frozen=True,
                            executable=dist / "CampusNet.exe",
                            cwd=root / "working",
                            source_root=root / "ignored-source",
                            bundled_directory=None,
                        )
                    )

                    self.assertEqual(
                        candidates,
                        [
                            (root / "working" / "config.json").absolute(),
                            (dist / "config.json").absolute(),
                        ],
                    )
                    self.assertNotIn((root / "config.json").absolute(), candidates)

    def test_does_not_dereference_symlink_candidate(self):
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            target = root / "target.json"
            symlink = root / "linked-config.json"
            target.write_text("{}\n", encoding="utf-8")
            try:
                symlink.symlink_to(target)
            except OSError as error:
                self.skipTest(f"当前系统不允许创建测试符号链接：{error}")

            candidates = list(
                config_candidates(
                    configured_path=symlink,
                    frozen=False,
                    executable=root / "ignored" / "CampusNet.exe",
                    cwd=root / "working",
                    source_root=root / "source",
                    bundled_directory=None,
                )
            )

            self.assertEqual(candidates[0], symlink.absolute())
            self.assertNotEqual(candidates[0], target.resolve())


class TestResolveConfigPath(unittest.TestCase):
    def test_returns_first_existing_file_in_candidate_order(self):
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            cwd = root / "working"
            source_root = root / "source"
            cwd.mkdir()
            source_root.mkdir()
            expected = cwd / "config.json"
            expected.write_text("{}\n", encoding="utf-8")
            (source_root / "config.json").write_text("{}\n", encoding="utf-8")

            resolved = resolve_config_path(
                configured_path="",
                frozen=False,
                executable=root / "ignored" / "CampusNet.exe",
                cwd=cwd,
                source_root=source_root,
                bundled_directory=None,
            )

            self.assertEqual(resolved, expected.absolute())

    def test_explicit_missing_path_does_not_fall_back(self):
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            explicit = root / "missing-explicit.json"
            cwd = root / "working"
            cwd.mkdir()
            (cwd / "config.json").write_text("{}\n", encoding="utf-8")

            with self.assertRaisesRegex(FileNotFoundError, "指定的配置文件不存在"):
                resolve_config_path(
                    configured_path=explicit,
                    frozen=False,
                    executable=root / "ignored" / "CampusNet.exe",
                    cwd=cwd,
                    source_root=root / "source",
                    bundled_directory=None,
                )

    def test_preferred_path_preserves_missing_explicit_path(self):
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            explicit = root / "missing-explicit.json"
            cwd = root / "working"
            cwd.mkdir()
            (cwd / "config.json").write_text("{}\n", encoding="utf-8")

            preferred = preferred_config_path(
                configured_path=explicit,
                frozen=False,
                executable=root / "ignored" / "CampusNet.exe",
                cwd=cwd,
                source_root=root / "source",
                bundled_directory=None,
            )

            self.assertEqual(preferred, explicit.absolute())

    def test_skips_directory_named_config_json(self):
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            cwd = root / "working"
            source_root = root / "source"
            (cwd / "config.json").mkdir(parents=True)
            source_root.mkdir()
            expected = source_root / "config.json"
            expected.write_text("{}\n", encoding="utf-8")

            resolved = resolve_config_path(
                configured_path="",
                frozen=False,
                executable=root / "ignored" / "CampusNet.exe",
                cwd=cwd,
                source_root=source_root,
                bundled_directory=None,
            )

            self.assertEqual(resolved, expected.absolute())


if __name__ == "__main__":
    unittest.main()
