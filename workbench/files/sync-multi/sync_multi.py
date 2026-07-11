#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import fnmatch
import hashlib
import json
import logging
import os
import platform
import random
import shutil
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from logging.handlers import RotatingFileHandler
from multiprocessing import Process
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer
from watchdog.observers.polling import PollingObserver

# —— 猫娘尾巴 ——
CAT_TAILS = ["喵～", "喵♡～", "呜喵～", "噜～"]


def random_tail() -> str:
    return random.choice(CAT_TAILS)


# —— 8. 资源限制 ——
try:
    import resource

    resource.setrlimit(resource.RLIMIT_AS, (1 << 30, 1 << 30))
    resource.setrlimit(resource.RLIMIT_CPU, (3600, 3600))
except Exception:
    pass

CFG_PATH = Path("config.json")
DEBOUNCE = 1.0
HEARTBEAT_INTERVAL = 3600
RESTART_DELAY = 5


# —— 猫娘日志格式 + 轮转 ——
class CatFormatter(logging.Formatter):
    def format(self, record):
        ct = self.formatTime(record, "%Y-%m-%d %H:%M:%S")
        return f"{ct} | {record.levelname:^5} | {record.getMessage()} {random_tail()}"


def setup_logger(name: str, logfile: Path) -> logging.Logger:
    logfile.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not logger.handlers:
        fmt = CatFormatter()
        fh = RotatingFileHandler(
            logfile, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
        )
        fh.setFormatter(fmt)
        sh = logging.StreamHandler()
        sh.setFormatter(fmt)
        logger.addHandler(fh)
        logger.addHandler(sh)
    return logger


def retry(times=3, delay=0.5):
    def deco(fn):
        def wrapper(*a, **kw):
            for i in range(times):
                try:
                    return fn(*a, **kw)
                except Exception:
                    if i < times - 1:
                        time.sleep(delay)
                    else:
                        raise

        return wrapper

    return deco


def compute_hash(path: Path, algo="sha256", chunk_size=8192) -> str:
    h = hashlib.new(algo)
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            h.update(chunk)
    return h.hexdigest()


class SyncTask:
    def __init__(self, cfg: dict):
        self.name = cfg.get("name", "sync_task")
        srcs = cfg.get("sources") or [cfg.get("source")]
        tgts = cfg.get("targets") or [cfg.get("target")]
        self.sources = list(dict.fromkeys(Path(p).expanduser().resolve() for p in srcs if p))
        self.targets = list(dict.fromkeys(Path(p).expanduser().resolve() for p in tgts if p))
        self.exclude = cfg.get("exclude", [])
        self.workers = cfg.get("workers", 4)
        self.logfile = Path(cfg.get("log", f"logs/{self.name}.log"))

        # 同步控制
        self._lock = threading.Lock()
        self._timer_lock = threading.Lock()
        self._timer = None
        self._pending = False
        self._paths_lock = threading.Lock()
        self._pending_paths = set()
        self._counter_lock = threading.Lock()
        self._copy_count = 0
        self._delete_count = 0
        self._owners_by_target: dict[Path, dict[Path, Path]] = {}
        self._stop_event = threading.Event()
        self._heartbeat_thread = None

        self._validate()
        self.logger = setup_logger(self.name, self.logfile)
        self.logger.info(f"🟢 启动任务「{self.name}」")

    def _validate(self):
        if not (self.sources and self.targets):
            raise ValueError("需至少一个源和一个目标")
        if (
            len(self.sources) > 1
            and len(self.targets) > 1
            and len(self.sources) != len(self.targets)
        ):
            raise ValueError("多个源和多个目标必须数量一致")
        for s in self.sources:
            if not s.is_dir():
                raise ValueError(f"源不存在：{s}")
        for source in self.sources:
            for target in self.targets:
                if source == target or source in target.parents or target in source.parents:
                    raise ValueError(f"源与目标不能重叠：{source} ↔ {target}")
        for t in self.targets:
            t.mkdir(parents=True, exist_ok=True)
            test = t / f".sync_test_{int(time.time())}"
            try:
                test.write_text("ok")
                test.unlink()
            except Exception as e:
                raise ValueError(f"目标不可写：{t}；{e}")

    def _pairs(self):
        if len(self.sources) == len(self.targets):
            return list(zip(self.sources, self.targets))
        if len(self.sources) == 1:
            return [(self.sources[0], t) for t in self.targets]
        return [(s, self.targets[0]) for s in self.sources]

    def _target_groups(self):
        groups: dict[Path, list[Path]] = {}
        for source, target in self._pairs():
            sources = groups.setdefault(target, [])
            if source not in sources:
                sources.append(source)
        return list(groups.items())

    def should_exclude(self, path: Path, base: Path) -> bool:
        rel = path.relative_to(base).as_posix()
        return any(fnmatch.fnmatch(rel, pat) for pat in self.exclude)

    def cleanup_tmp_files(self):
        for t_base, _ in self._target_groups():
            for tmp in t_base.rglob("*.sync_tmp*"):
                try:
                    if self.should_exclude(tmp, t_base):
                        continue
                    tmp.unlink()
                    self.logger.info(f"🧹 清理临时文件：{tmp}")
                except Exception:
                    pass

    @retry(times=3, delay=0.3)
    def _atomic_copy(self, src: Path, dst: Path):
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_symlink():
            target = os.readlink(src)
            try:
                dst.unlink()
            except Exception:
                pass
            os.symlink(target, dst)
            try:
                shutil.copystat(src, dst, follow_symlinks=False)
            except Exception:
                pass
            return
        tmp_path = None
        try:
            with src.open("rb") as fsrc:
                with tempfile.NamedTemporaryFile(dir=dst.parent, delete=False) as tmp:
                    tmp_path = Path(tmp.name)
                    shutil.copyfileobj(fsrc, tmp)
                    tmp.flush()
            tmp_path.replace(dst)
            try:
                shutil.copystat(src, dst, follow_symlinks=False)
            except Exception:
                pass
        finally:
            if tmp_path is not None and tmp_path.exists():
                try:
                    tmp_path.unlink()
                except Exception:
                    pass

    @retry(times=3, delay=0.3)
    def _safe_delete(self, path: Path):
        if path.is_dir() and not path.is_symlink():
            path.rmdir()
        else:
            path.unlink()

    def _wrapped_copy(self, src, dst, sem):
        try:
            self._atomic_copy(src, dst)
            with self._counter_lock:
                self._copy_count += 1
            self.logger.info(f"📄 复制: {src} → {dst}")
        finally:
            sem.release()

    def _wrapped_delete(self, path, sem):
        try:
            self._safe_delete(path)
            with self._counter_lock:
                self._delete_count += 1
            self.logger.info(f"🗑 删除: {path}")
        finally:
            sem.release()

    def _build_union_manifest(self, source_bases: list[Path]):
        manifest: dict[Path, Path] = {}
        directories: set[Path] = set()
        conflicted_paths: set[Path] = set()

        for source_base in source_bases:
            paths = sorted(
                source_base.rglob("*"),
                key=lambda path: path.relative_to(source_base).as_posix(),
            )
            for source in paths:
                try:
                    if self.should_exclude(source, source_base):
                        continue

                    relative = source.relative_to(source_base)
                    blocking_file = next(
                        (
                            parent
                            for parent in relative.parents
                            if parent != Path(".") and parent in manifest
                        ),
                        None,
                    )
                    is_leaf = source.is_file() or source.is_symlink()

                    if not is_leaf and source.is_dir():
                        if relative in manifest or blocking_file is not None:
                            if relative in manifest:
                                conflicted_paths.add(relative)
                            elif blocking_file is not None:
                                conflicted_paths.add(blocking_file)
                            self.logger.warning(
                                f"⚠️ 路径冲突，保留靠前 source 的内容：{relative}（忽略 {source}）"
                            )
                            continue
                        directories.add(relative)
                        continue

                    if not is_leaf:
                        continue
                    if relative in manifest:
                        conflicted_paths.add(relative)
                    elif blocking_file is not None:
                        conflicted_paths.add(blocking_file)

                    if relative in manifest or blocking_file is not None or relative in directories:
                        self.logger.warning(
                            f"⚠️ 路径冲突，保留靠前 source 的内容：{relative}（忽略 {source}）"
                        )
                        continue

                    manifest[relative] = source
                    directories.update(parent for parent in relative.parents if parent != Path("."))
                except Exception:
                    continue

        return manifest, directories, conflicted_paths

    def _needs_copy(self, source: Path, target: Path, force_hash: bool) -> bool:
        if source.is_symlink():
            return not target.is_symlink() or os.readlink(source) != os.readlink(target)
        if target.is_symlink() or not target.is_file():
            return True

        source_stat = source.stat()
        target_stat = target.stat()
        if source_stat.st_size != target_stat.st_size:
            return True
        if not force_hash and source_stat.st_mtime_ns == target_stat.st_mtime_ns:
            return False
        return compute_hash(source) != compute_hash(target)

    def _prune_empty_directories(self, target_base: Path, desired_directories: set[Path]):
        directories = sorted(
            (path for path in target_base.rglob("*") if path.is_dir() and not path.is_symlink()),
            key=lambda path: len(path.parts),
            reverse=True,
        )
        for directory in directories:
            try:
                relative = directory.relative_to(target_base)
                if relative in desired_directories or self.should_exclude(directory, target_base):
                    continue
                directory.rmdir()
                with self._counter_lock:
                    self._delete_count += 1
                self.logger.info(f"🗑 删除: {directory}")
            except OSError:
                continue

    def _sync_target(self, pool, sem, target_base: Path, source_bases: list[Path]):
        manifest, desired_directories, conflicted_paths = self._build_union_manifest(source_bases)
        delete_futures = []

        for target in target_base.rglob("*"):
            try:
                if not (target.is_file() or target.is_symlink()):
                    continue
                relative = target.relative_to(target_base)
                if self.should_exclude(target, target_base) or relative in manifest:
                    continue
                sem.acquire()
                delete_futures.append(pool.submit(self._wrapped_delete, target, sem))
            except Exception:
                continue

        for future in delete_futures:
            future.result()
        self._prune_empty_directories(target_base, desired_directories)

        for relative in sorted(desired_directories, key=lambda path: len(path.parts)):
            (target_base / relative).mkdir(parents=True, exist_ok=True)

        previous_owners = self._owners_by_target.get(target_base, {})
        is_shared_target = len(source_bases) > 1
        copy_futures = []
        for relative, source in manifest.items():
            target = target_base / relative
            previous_owner = previous_owners.get(relative)
            owner_changed = previous_owner is not None and previous_owner != source
            force_hash = is_shared_target or relative in conflicted_paths or owner_changed
            if self._needs_copy(source, target, force_hash):
                sem.acquire()
                copy_futures.append(pool.submit(self._wrapped_copy, source, target, sem))

        for future in copy_futures:
            future.result()
        self._owners_by_target[target_base] = manifest.copy()

    def sync(self):
        if self._stop_event.is_set():
            return

        # 批量变动汇总
        with self._paths_lock:
            changed = list(self._pending_paths)
            self._pending_paths.clear()
        if changed:
            txt = "; ".join(str(p) for p in changed)
            self.logger.info(f"✨ 检测到变动 {len(changed)} 条: {txt}")

        if not self._lock.acquire(False):
            self._pending = True
            return

        with self._counter_lock:
            self._copy_count = 0
            self._delete_count = 0

        start = time.time()
        self.logger.info("🕒 开始同步")
        sem = threading.Semaphore(self.workers * 2)
        try:
            with ThreadPoolExecutor(max_workers=self.workers) as pool:
                for target_base, source_bases in self._target_groups():
                    self._sync_target(pool, sem, target_base, source_bases)

            elapsed = time.time() - start
            self.logger.info(
                f"✅ 同步完成：复制 {self._copy_count} 个，"
                f"删除 {self._delete_count} 个，耗时 {elapsed:.2f}s"
            )
        except Exception as e:
            self.logger.error(f"同步出错：{e}", exc_info=True)
        finally:
            self._lock.release()
            if self._pending:
                self._pending = False
                self.sync()

    class Handler(FileSystemEventHandler):
        def __init__(self, task):
            self.task = task

        def on_any_event(self, event):
            if self.task._stop_event.is_set():
                return
            with self.task._paths_lock:
                self.task._pending_paths.add(Path(event.src_path))
            with self.task._timer_lock:
                if self.task._stop_event.is_set():
                    return
                if self.task._timer and self.task._timer.is_alive():
                    self.task._timer.cancel()
                self.task._timer = threading.Timer(DEBOUNCE, self.task.sync)
                self.task._timer.daemon = True
                self.task._timer.start()

    def _heartbeat_loop(self):
        while not self._stop_event.wait(HEARTBEAT_INTERVAL):
            self.logger.info(f"🔄 心跳：任务「{self.name}」正常运行")

    def start(self):
        self._stop_event.clear()
        self.cleanup_tmp_files()
        self.sync()
        obs_list = []
        try:
            for s in self.sources:
                ObsCls = PollingObserver if (platform.system() == "Darwin") else Observer
                obs = ObsCls()
                obs.schedule(self.Handler(self), str(s), recursive=True)
                obs.start()
                obs_list.append(obs)
                self.logger.info(f"👀 监听: {s}")
        except Exception:
            for obs in obs_list:
                obs.stop()
            for obs in obs_list:
                obs.join()
            self.stop()
            raise
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()
        return obs_list

    def stop(self):
        self._stop_event.set()
        with self._timer_lock:
            timer = self._timer
            self._timer = None
        if timer is not None:
            timer.cancel()
            if timer is not threading.current_thread():
                timer.join()
        if (
            self._heartbeat_thread is not None
            and self._heartbeat_thread is not threading.current_thread()
        ):
            self._heartbeat_thread.join()
        self._heartbeat_thread = None


# —— 动态重载配置 ——
tasks: list[SyncTask] = []
task_observers: list = []
reload_lock = threading.Lock()


def stop_runtime(runtime_tasks, runtime_observers):
    for observer in runtime_observers:
        try:
            observer.stop()
        except Exception:
            logging.exception("停止目录观察器失败")
    for observer in runtime_observers:
        try:
            observer.join()
        except Exception:
            logging.exception("等待目录观察器退出失败")
    for task in runtime_tasks:
        try:
            task.stop()
        except Exception:
            logging.exception(f"停止任务失败：{getattr(task, 'name', '<unknown>')}")


def shutdown_tasks():
    with reload_lock:
        old_tasks = list(tasks)
        old_observers = list(task_observers)
        tasks.clear()
        task_observers.clear()
        stop_runtime(old_tasks, old_observers)


class ConfigReloader(FileSystemEventHandler):
    def __init__(self):
        super().__init__()
        self._lock = threading.Lock()
        self._timer = None
        self._is_stopped = False

    def on_any_event(self, event):
        if event.event_type not in {"created", "modified", "moved"}:
            return
        event_paths = [Path(event.src_path).resolve()]
        if getattr(event, "dest_path", None):
            event_paths.append(Path(event.dest_path).resolve())
        if CFG_PATH.resolve() not in event_paths:
            return

        with self._lock:
            if self._is_stopped:
                return
            if self._timer and self._timer.is_alive():
                self._timer.cancel()
            self._timer = threading.Timer(DEBOUNCE, reload_config)
            self._timer.daemon = True
            self._timer.start()

    def stop(self):
        with self._lock:
            self._is_stopped = True
            timer = self._timer
            self._timer = None
        if timer is not None:
            timer.cancel()
            if timer is not threading.current_thread():
                timer.join()


def load_tasks():
    cfg = json.loads(CFG_PATH.read_text(encoding="utf-8"))
    task_configs = cfg.get("tasks", [])
    if not isinstance(task_configs, list):
        raise ValueError("tasks 必须是数组")
    return [SyncTask(task_config) for task_config in task_configs]


def start_tasks(new_tasks):
    new_observers = []
    try:
        for task in new_tasks:
            new_observers.extend(task.start())
    except Exception:
        stop_runtime(new_tasks, new_observers)
        raise
    return new_observers


def reload_config():
    with reload_lock:
        logging.info("🔄 配置变更，重新加载任务")
        try:
            new_tasks = load_tasks()
            new_observers = start_tasks(new_tasks)
        except Exception as e:
            logging.error(f"加载 config.json 失败，保留当前任务：{e}")
            return False

        old_tasks = list(tasks)
        old_observers = list(task_observers)
        tasks[:] = new_tasks
        task_observers[:] = new_observers
        stop_runtime(old_tasks, old_observers)
        return True


def sync_worker():
    logger = logging.getLogger("sync_worker")
    cfg_obs = PollingObserver()
    config_reloader = ConfigReloader()
    is_config_observer_started = False
    try:
        cfg_obs.schedule(config_reloader, str(CFG_PATH.parent), recursive=False)
        cfg_obs.start()
        is_config_observer_started = True
        reload_config()
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        logger.info("子进程收到退出信号，优雅退出")
    finally:
        if is_config_observer_started:
            cfg_obs.stop()
            cfg_obs.join()
        config_reloader.stop()
        shutdown_tasks()


def supervise():
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(CatFormatter())
    root_logger.addHandler(handler)
    try:
        while True:
            p = Process(target=sync_worker, name="sync_worker")
            p.start()
            p.join()
            root_logger.error(f"🚨 子进程退出(code={p.exitcode})，{RESTART_DELAY}s 后重启")
            time.sleep(RESTART_DELAY)
    except KeyboardInterrupt:
        root_logger.info("父进程收到退出信号，优雅退出")
        sys.exit(0)


if __name__ == "__main__":
    supervise()
