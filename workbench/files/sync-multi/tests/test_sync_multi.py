import importlib.util
import json
import os
import shutil
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest import mock
from uuid import uuid4

if importlib.util.find_spec("watchdog") is None:
    watchdog = types.ModuleType("watchdog")
    watchdog_events = types.ModuleType("watchdog.events")
    watchdog_observers = types.ModuleType("watchdog.observers")
    watchdog_polling = types.ModuleType("watchdog.observers.polling")

    class StubEventHandler:
        pass

    class StubObserver:
        pass

    watchdog_events.FileSystemEventHandler = StubEventHandler
    watchdog_observers.Observer = StubObserver
    watchdog_polling.PollingObserver = StubObserver
    sys.modules.update(
        {
            "watchdog": watchdog,
            "watchdog.events": watchdog_events,
            "watchdog.observers": watchdog_observers,
            "watchdog.observers.polling": watchdog_polling,
        }
    )


MODULE_PATH = Path(__file__).resolve().parents[1] / "sync_multi.py"
SPEC = importlib.util.spec_from_file_location("sync_multi", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"无法加载测试模块：{MODULE_PATH}")
sync_multi = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync_multi)


def make_task(root, sources, targets, exclude=None):
    return sync_multi.SyncTask(
        {
            "name": f"task-{uuid4()}",
            "sources": [str(source) for source in sources],
            "targets": [str(target) for target in targets],
            "exclude": exclude or [],
            "workers": 2,
            "log": str(root / f"{uuid4()}.log"),
        }
    )


def close_task(task):
    task.stop()
    for handler in task.logger.handlers[:]:
        task.logger.removeHandler(handler)
        handler.close()


class FakeObserver:
    def __init__(self):
        self.is_running = False
        self.scheduled = []
        self.stop_count = 0
        self.join_count = 0

    def schedule(self, handler, path, recursive):
        self.scheduled.append((handler, path, recursive))

    def start(self):
        self.is_running = True

    def stop(self):
        self.stop_count += 1
        self.is_running = False

    def join(self):
        self.join_count += 1


class SyncTaskTests(unittest.TestCase):
    def test_rejects_ambiguous_many_to_many_cardinality(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            sources = [root / f"source-{index}" for index in range(2)]
            targets = [root / f"target-{index}" for index in range(3)]
            for source in sources:
                source.mkdir()

            with self.assertRaisesRegex(ValueError, "必须数量一致"):
                make_task(root, sources, targets)

    def test_canonical_paths_are_deduplicated_before_pairing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source"
            target = root / "target"
            source.mkdir()

            task = make_task(root, [source, source / "."], [target, target / "."])
            try:
                self.assertEqual(task.sources, [source.resolve()])
                self.assertEqual(task.targets, [target.resolve()])
                self.assertEqual(task._pairs(), [(source.resolve(), target.resolve())])
            finally:
                close_task(task)

    def test_rejects_nested_source_and_target_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source"
            source.mkdir()

            with self.assertRaisesRegex(ValueError, "源与目标不能重叠"):
                make_task(root, [source], [source / "target"])

            target = root / "target"
            nested_source = target / "source"
            nested_source.mkdir(parents=True)
            with self.assertRaisesRegex(ValueError, "源与目标不能重叠"):
                make_task(root, [nested_source], [target])

    def test_same_target_aliases_share_one_union_group(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_a = root / "source-a"
            source_b = root / "source-b"
            target = root / "target"
            source_a.mkdir()
            source_b.mkdir()
            target.mkdir()
            (source_a / "alpha.txt").write_text("alpha", encoding="utf-8")
            (source_b / "beta.txt").write_text("beta", encoding="utf-8")
            target_alias = Path(os.path.relpath(target, Path.cwd()))

            task = make_task(
                root,
                [source_a, source_b],
                [target.resolve(), target_alias],
            )
            try:
                self.assertEqual(len(task._target_groups()), 1)
                task.sync()

                self.assertTrue((target / "alpha.txt").exists())
                self.assertTrue((target / "beta.txt").exists())
            finally:
                close_task(task)

    def test_shared_target_uses_source_union_and_ordered_ownership(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_a = root / "source-a"
            source_b = root / "source-b"
            target = root / "target"
            source_a.mkdir()
            source_b.mkdir()
            (source_a / "alpha.txt").write_text("alpha", encoding="utf-8")
            (source_a / "shared.txt").write_text("owned by a", encoding="utf-8")
            (source_b / "beta.txt").write_text("beta", encoding="utf-8")
            (source_b / "shared.txt").write_text("owned by b", encoding="utf-8")
            target.mkdir()
            shutil.copy2(source_b / "shared.txt", target / "shared.txt")
            (target / "orphan.txt").write_text("remove me", encoding="utf-8")

            task = make_task(root, [source_a, source_b], [target])
            try:
                task.sync()

                self.assertEqual((target / "alpha.txt").read_text(encoding="utf-8"), "alpha")
                self.assertEqual((target / "beta.txt").read_text(encoding="utf-8"), "beta")
                self.assertEqual(
                    (target / "shared.txt").read_text(encoding="utf-8"),
                    "owned by a",
                )
                self.assertFalse((target / "orphan.txt").exists())

                (source_a / "shared.txt").unlink()
                task.sync()

                self.assertEqual(
                    (target / "shared.txt").read_text(encoding="utf-8"),
                    "owned by b",
                )
                self.assertTrue((target / "alpha.txt").exists())
                self.assertTrue((target / "beta.txt").exists())

                (source_b / "beta.txt").unlink()
                (source_b / "shared.txt").unlink()
                task.sync()

                self.assertTrue((target / "alpha.txt").exists())
                self.assertFalse((target / "beta.txt").exists())
                self.assertFalse((target / "shared.txt").exists())
            finally:
                close_task(task)

    def test_shared_target_reconciles_owner_after_task_reload(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_a = root / "source-a"
            source_b = root / "source-b"
            target = root / "target"
            source_a.mkdir()
            source_b.mkdir()
            target.mkdir()
            path_a = source_a / "shared.txt"
            path_b = source_b / "shared.txt"
            path_a.write_text("AAAA", encoding="utf-8")
            path_b.write_text("BBBB", encoding="utf-8")
            same_ns = 1_700_000_000_000_000_000
            os.utime(path_a, ns=(same_ns, same_ns))
            os.utime(path_b, ns=(same_ns, same_ns))

            first_task = make_task(root, [source_a, source_b], [target])
            try:
                first_task.sync()
                self.assertEqual(
                    (target / "shared.txt").read_text(encoding="utf-8"),
                    "AAAA",
                )
            finally:
                close_task(first_task)

            path_a.unlink()
            reloaded_task = make_task(root, [source_a, source_b], [target])
            try:
                reloaded_task.sync()
                self.assertEqual(
                    (target / "shared.txt").read_text(encoding="utf-8"),
                    "BBBB",
                )
            finally:
                close_task(reloaded_task)

    def test_atomic_copy_failure_does_not_leave_temp_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source"
            target = root / "target"
            source.mkdir()
            task = make_task(root, [source], [target])
            try:
                with (
                    mock.patch.object(sync_multi.time, "sleep"),
                    self.assertRaises(FileNotFoundError),
                ):
                    task._atomic_copy(source / "missing.txt", target / "output.txt")

                self.assertEqual(list(target.glob("tmp*")), [])
            finally:
                close_task(task)

    def test_cleanup_tmp_files_respects_exclude_patterns(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source"
            target = root / "target"
            source.mkdir()
            cache = target / "cache"
            cache.mkdir(parents=True)
            protected = cache / "keep.sync_tmp123"
            removable = target / "remove.sync_tmp123"
            protected.write_text("protected", encoding="utf-8")
            removable.write_text("temporary", encoding="utf-8")
            task = make_task(root, [source], [target], ["cache/**"])
            try:
                task.cleanup_tmp_files()

                self.assertTrue(protected.exists())
                self.assertFalse(removable.exists())
            finally:
                close_task(task)

    def test_empty_directories_follow_union_ownership(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source"
            target = root / "target"
            empty_source = source / "empty"
            empty_source.mkdir(parents=True)
            task = make_task(root, [source], [target])
            try:
                task.sync()
                self.assertTrue((target / "empty").is_dir())

                empty_source.rmdir()
                task.sync()
                self.assertFalse((target / "empty").exists())
            finally:
                close_task(task)

    def test_directory_owner_blocks_later_file_until_removed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_a = root / "source-a"
            source_b = root / "source-b"
            target = root / "target"
            owned_directory = source_a / "entry"
            owned_directory.mkdir(parents=True)
            source_b.mkdir()
            (source_b / "entry").write_text("fallback", encoding="utf-8")
            task = make_task(root, [source_a, source_b], [target])
            try:
                task.sync()
                self.assertTrue((target / "entry").is_dir())

                owned_directory.rmdir()
                task.sync()
                self.assertEqual(
                    (target / "entry").read_text(encoding="utf-8"),
                    "fallback",
                )
            finally:
                close_task(task)

    def test_file_events_are_debounced_without_immediate_sync(self):
        class FakeTimer:
            def __init__(self, interval, callback):
                self.interval = interval
                self.callback = callback
                self.daemon = False
                self.is_started = False
                self.is_cancelled = False

            def start(self):
                self.is_started = True

            def is_alive(self):
                return self.is_started and not self.is_cancelled

            def cancel(self):
                self.is_cancelled = True

            def join(self):
                pass

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source"
            target = root / "target"
            source.mkdir()
            task = make_task(root, [source], [target])
            try:
                event = types.SimpleNamespace(src_path=str(source / "changed.txt"))
                with (
                    mock.patch.object(sync_multi.threading, "Timer", FakeTimer),
                    mock.patch.object(task, "sync") as sync,
                ):
                    task.Handler(task).on_any_event(event)

                    self.assertFalse(sync.called)
                    self.assertTrue(task._timer.is_started)
                    task._timer.callback()
                    sync.assert_called_once_with()
            finally:
                close_task(task)


class SyncWorkerTests(unittest.TestCase):
    def setUp(self):
        sync_multi.task_observers.clear()
        sync_multi.tasks.clear()

    def tearDown(self):
        sync_multi.task_observers.clear()
        sync_multi.tasks.clear()

    def test_config_observer_survives_initial_reload_and_is_cleaned_up_on_exit(self):
        config_observer = FakeObserver()
        task_observer = FakeObserver()

        def reload_probe():
            self.assertTrue(config_observer.is_running)
            self.assertNotIn(config_observer, sync_multi.task_observers)
            sync_multi.task_observers.append(task_observer)

        with (
            mock.patch.object(sync_multi, "PollingObserver", return_value=config_observer),
            mock.patch.object(sync_multi, "reload_config", side_effect=reload_probe),
            mock.patch.object(sync_multi.time, "sleep", side_effect=KeyboardInterrupt),
        ):
            sync_multi.sync_worker()

        self.assertEqual(config_observer.stop_count, 1)
        self.assertEqual(config_observer.join_count, 1)
        self.assertEqual(task_observer.stop_count, 1)
        self.assertEqual(task_observer.join_count, 1)
        self.assertEqual(len(config_observer.scheduled), 1)
        config_reloader = config_observer.scheduled[0][0]
        self.assertTrue(config_reloader._is_stopped)

    def test_config_reloader_handles_atomic_move_and_cancels_pending_timer(self):
        class FakeTimer:
            def __init__(self, interval, callback):
                self.interval = interval
                self.callback = callback
                self.daemon = False
                self.is_started = False
                self.is_cancelled = False
                self.is_joined = False

            def start(self):
                self.is_started = True

            def is_alive(self):
                return self.is_started and not self.is_cancelled

            def cancel(self):
                self.is_cancelled = True

            def join(self):
                self.is_joined = True

        class MoveEvent:
            event_type = "moved"

            def __init__(self, source, destination):
                self.src_path = str(source)
                self.dest_path = str(destination)

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "config.json"
            reloader = sync_multi.ConfigReloader()
            with (
                mock.patch.object(sync_multi, "CFG_PATH", config_path),
                mock.patch.object(sync_multi.threading, "Timer", FakeTimer),
            ):
                reloader.on_any_event(MoveEvent(root / "config.tmp", config_path))
                timer = reloader._timer
                self.assertIsNotNone(timer)
                self.assertTrue(timer.is_started)
                self.assertTrue(timer.daemon)

                reloader.stop()

            self.assertTrue(timer.is_cancelled)
            self.assertTrue(timer.is_joined)
            self.assertTrue(reloader._is_stopped)

    def test_invalid_config_preserves_current_runtime(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text("{", encoding="utf-8")
            old_task = object()
            old_observer = FakeObserver()
            sync_multi.tasks.append(old_task)
            sync_multi.task_observers.append(old_observer)

            with mock.patch.object(sync_multi, "CFG_PATH", config_path):
                self.assertFalse(sync_multi.reload_config())

            self.assertEqual(sync_multi.tasks, [old_task])
            self.assertEqual(sync_multi.task_observers, [old_observer])
            self.assertEqual(old_observer.stop_count, 0)
            self.assertEqual(old_observer.join_count, 0)

    def test_concurrent_reloads_are_serialized(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text(
                json.dumps({"tasks": [{"name": "one"}]}),
                encoding="utf-8",
            )

            class OldTask:
                name = "old"

                def __init__(self):
                    self.stop_count = 0

                def stop(self):
                    self.stop_count += 1

            class ReloadTask:
                instances = []

                def __init__(self, cfg):
                    self.name = cfg["name"]
                    self.stop_count = 0
                    self.observer = FakeObserver()
                    self.__class__.instances.append(self)

                def start(self):
                    return [self.observer]

                def stop(self):
                    self.stop_count += 1

            old_task = OldTask()
            old_observer = FakeObserver()
            sync_multi.tasks.append(old_task)
            sync_multi.task_observers.append(old_observer)
            gate = threading.Barrier(3)
            results = []

            def run_reload():
                gate.wait()
                results.append(sync_multi.reload_config())

            with (
                mock.patch.object(sync_multi, "CFG_PATH", config_path),
                mock.patch.object(sync_multi, "SyncTask", ReloadTask),
            ):
                threads = [threading.Thread(target=run_reload) for _ in range(2)]
                for thread in threads:
                    thread.start()
                gate.wait()
                for thread in threads:
                    thread.join(timeout=5)

                self.assertTrue(all(not thread.is_alive() for thread in threads))
                self.assertEqual(results, [True, True])
                self.assertEqual(len(sync_multi.tasks), 1)
                self.assertEqual(len(sync_multi.task_observers), 1)
                self.assertEqual(len(ReloadTask.instances), 2)
                active_task = sync_multi.tasks[0]
                inactive_task = next(
                    task for task in ReloadTask.instances if task is not active_task
                )
                self.assertEqual(inactive_task.stop_count, 1)
                self.assertEqual(inactive_task.observer.stop_count, 1)
                self.assertEqual(inactive_task.observer.join_count, 1)
                self.assertEqual(active_task.stop_count, 0)
                self.assertEqual(old_task.stop_count, 1)
                self.assertEqual(old_observer.stop_count, 1)
                self.assertEqual(old_observer.join_count, 1)
                sync_multi.shutdown_tasks()


if __name__ == "__main__":
    unittest.main()
