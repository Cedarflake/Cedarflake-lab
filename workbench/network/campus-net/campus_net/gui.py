from __future__ import annotations

import ctypes
import os
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from pathlib import Path
from queue import Empty, Queue
from tkinter import BooleanVar, IntVar, StringVar, TclError, Text, Toplevel, messagebox

import ttkbootstrap as ttk
from PIL import Image, ImageTk, UnidentifiedImageError
from ttkbootstrap.widgets.scrolled import ScrolledFrame

from .config_paths import packaged_project_root, resolve_config_path
from .config_store import (
    ConfigCommitUncertainError,
    ConfigIntegrityError,
    ConfigRevision,
    ConfigRevisionError,
    ConfigStoreError,
    EditableConfig,
    load_editable_config,
    save_editable_config,
)
from .gui_core import (
    CaptchaRequested,
    FailedEvent,
    FinishedEvent,
    LogEvent,
    OperationController,
    build_config_from_form,
    form_values_from_config,
)
from .interfaces import NetworkInterface, list_windows_ipv4_interfaces
from .window_state import (
    ScreenRect,
    WindowState,
    clamp_window_state,
    load_window_state,
    save_window_state,
)

THEMES = ("darkly", "flatly")
THEME_LABELS = {
    "深色": "darkly",
    "浅色": "flatly",
}
CARRIERS = ("中国移动", "中国电信", "中国联通")
COMBOBOX_WHEEL_GUARD_TAG = "CampusNetComboboxWheelGuard"
STATUS_ICONS = {
    "info": "●",
    "success": "✓",
    "warning": "!",
    "danger": "×",
    "secondary": "○",
}
LIGHT_SEMANTIC_COLORS = {
    "info": "#0369a1",
    "success": "#0f766e",
    "warning": "#a16207",
    "danger": "#b91c1c",
    "secondary": "#566573",
}
MAX_LOG_LINES = 1000
MIN_WINDOW_WIDTH = 940
MIN_WINDOW_HEIGHT = 620
DEFAULT_WINDOW_WIDTH = 1100
DEFAULT_WINDOW_HEIGHT = 720


@dataclass(frozen=True, slots=True)
class _InterfaceResult:
    interfaces: tuple[NetworkInterface, ...] = ()
    error: str | None = None


@dataclass(slots=True)
class _CaptchaDialog:
    operation_id: int
    request_id: int
    window: Toplevel
    photo: ImageTk.PhotoImage


class CampusNetApp:
    def __init__(
        self,
        root: ttk.Window,
        *,
        config_path: Path,
        initialize_runtime: bool = True,
    ) -> None:
        self.root = root
        self._initialize_runtime = initialize_runtime
        self.config_path = config_path.absolute()
        self.backup_directory = default_backup_directory()
        self.window_state_path = default_window_state_path()
        self.controller = OperationController()
        self._revision = ConfigRevision.absent()
        self._save_allowed = True
        self._active_operation_id: int | None = None
        self._captcha_dialog: _CaptchaDialog | None = None
        self._interface_results: Queue[_InterfaceResult] = Queue()
        self._interface_by_display: dict[str, int] = {}
        self._interface_details_by_display: dict[str, NetworkInterface] = {}
        self._interface_loading = False
        self._is_closing = False
        self._close_deadline = 0.0
        self._poll_after_id: str | None = None
        self._window_state_saved = False
        self._last_normal_window_state: WindowState | None = None
        self._restore_maximized = False

        self.version_var = IntVar(master=root, value=2)
        self.theme_var = StringVar(master=root, value="darkly")
        self.theme_display_var = StringVar(master=root, value="深色")
        self.show_secrets_var = BooleanVar(master=root, value=False)
        self.status_var = StringVar(master=root, value="准备就绪")
        self.header_status_var = StringVar(master=root, value="准备就绪")
        self.status_icon_var = StringVar(master=root, value=STATUS_ICONS["info"])
        self.config_path_var = StringVar(master=root, value=str(self.config_path))
        self.interface_display_var = StringVar(master=root)
        self.interface_status_var = StringVar(master=root, value="等待读取网络接口")
        self.interface_meta_var = StringVar(master=root, value="支持 Wi-Fi、以太网及其他 IPv4 网卡")
        self.v2_vars = {
            "portal_url": StringVar(master=root, value="http://10.71.29.181"),
            "username": StringVar(master=root),
            "password": StringVar(master=root),
            "carrier": StringVar(master=root, value="中国电信"),
        }
        self.v1_vars = {
            "login_url": StringVar(master=root),
            "username": StringVar(master=root),
            "encrypted_password": StringVar(master=root),
            "carrier": StringVar(master=root),
            "user_group": StringVar(master=root),
            "session_id": StringVar(master=root),
        }
        self._secret_entries: list[ttk.Entry] = []
        self._version_buttons: list[ttk.Radiobutton] = []
        self._status_style = "info"
        self._interface_status_style = "secondary"
        self._window_icon_photo: ImageTk.PhotoImage | None = None
        self._header_logo_photo: ImageTk.PhotoImage | None = None

        for sequence in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
            self.root.bind_class(
                COMBOBOX_WHEEL_GUARD_TAG,
                sequence,
                self._stop_combobox_wheel,
            )

        self._configure_window()
        self._configure_styles()
        self._load_brand_images()
        self._build_layout()
        if self._restore_maximized:
            self.root.after_idle(self._restore_window_maximized)
        self._show_version_form()
        self._apply_text_theme()
        self._update_controls()

        if initialize_runtime:
            self._load_config()
            self.root.after(150, self.refresh_interfaces)
        self._schedule_event_poll()

    def _configure_window(self) -> None:
        self.root.title("Campus Net · 校园网连接")
        work_areas = _screen_work_areas(self.root)
        primary_work_area = work_areas[0]
        effective_min_width = min(MIN_WINDOW_WIDTH, primary_work_area.width)
        effective_min_height = min(MIN_WINDOW_HEIGHT, primary_work_area.height)
        saved_state = (
            load_window_state(self.window_state_path) if self._initialize_runtime else None
        )
        restored_state = clamp_window_state(
            saved_state,
            work_areas,
            min_width=effective_min_width,
            min_height=effective_min_height,
            default_width=DEFAULT_WINDOW_WIDTH,
            default_height=DEFAULT_WINDOW_HEIGHT,
        )
        self._last_normal_window_state = WindowState(
            width=restored_state.width,
            height=restored_state.height,
            x=restored_state.x,
            y=restored_state.y,
        )
        self._restore_maximized = restored_state.maximized
        self.root.geometry(restored_state.geometry)
        self.root.minsize(effective_min_width, effective_min_height)
        self.root.bind("<Configure>", self._remember_window_geometry, add="+")
        self.root.protocol("WM_DELETE_WINDOW", self._request_close)

    def _configure_styles(self) -> None:
        style = self.root.style
        colors = style.colors
        is_dark = self.theme_var.get() == "darkly"
        canvas_background = colors.active if is_dark else colors.light
        card_background = colors.bg
        panel_background = colors.inputbg if is_dark else colors.light
        muted_foreground = colors.light if is_dark else colors.dark
        border_color = colors.secondary if is_dark else colors.border

        self.root.configure(background=canvas_background)
        style.configure("App.TFrame", background=canvas_background)
        style.configure("CardBorder.TFrame", background=border_color)
        style.configure("Card.TFrame", background=card_background)
        style.configure("Card.TLabel", background=card_background, foreground=colors.fg)
        style.configure(
            "CardTitle.TLabel",
            background=card_background,
            foreground=colors.fg,
            font=("Segoe UI", 14, "bold"),
        )
        style.configure(
            "CardSubtitle.TLabel",
            background=card_background,
            foreground=muted_foreground,
            font=("Segoe UI", 9),
        )
        style.configure(
            "Field.TLabel",
            background=card_background,
            foreground=muted_foreground,
            font=("Segoe UI", 9, "bold"),
        )
        style.configure("Panel.TFrame", background=panel_background)
        style.configure("ToggleBorder.TFrame", background=colors.border)
        style.configure("ToggleControl.TFrame", background=colors.inputbg)
        style.configure(
            "PanelMeta.TLabel",
            background=panel_background,
            foreground=muted_foreground,
            font=("Segoe UI", 9),
        )
        style.configure(
            "Hero.TFrame",
            background=colors.primary,
        )
        style.configure(
            "HeroMark.TLabel",
            background="#ffffff",
            foreground=colors.primary,
            font=("Segoe UI", 12, "bold"),
            anchor="center",
        )
        style.configure(
            "HeroLogo.TLabel",
            background=colors.primary,
            anchor="center",
        )
        style.configure(
            "HeroTitle.TLabel",
            background=colors.primary,
            foreground="#ffffff",
            font=("Segoe UI", 20, "bold"),
        )
        style.configure(
            "HeroSubtitle.TLabel",
            background=colors.primary,
            foreground="#dbe7f3",
            font=("Segoe UI", 9),
        )
        style.configure(
            "HeroStatus.TLabel",
            background=colors.primary,
            foreground="#ffffff",
            font=("Segoe UI", 9, "bold"),
        )
        style.configure(
            "Footer.TLabel",
            background=canvas_background,
            foreground=muted_foreground,
            font=("Segoe UI", 9),
        )
        style.configure("TEntry", padding=(9, 7))
        style.configure("TCombobox", padding=(7, 7))

        for semantic_style in STATUS_ICONS:
            semantic_color = (
                getattr(colors, semantic_style)
                if is_dark
                else LIGHT_SEMANTIC_COLORS[semantic_style]
            )
            style_name = semantic_style.title()
            style.configure(
                f"{style_name}.StatusIcon.TLabel",
                background=panel_background,
                foreground=semantic_color,
                font=("Segoe UI", 18, "bold"),
                anchor="center",
            )
            style.configure(
                f"{style_name}.StatusText.TLabel",
                background=panel_background,
                foreground=semantic_color,
                font=("Segoe UI", 12, "bold"),
            )
            style.configure(
                f"{style_name}.Interface.TLabel",
                background=card_background,
                foreground=semantic_color,
                font=("Segoe UI", 9, "bold"),
            )

    def _load_brand_images(self) -> None:
        try:
            with Image.open(app_icon_path()) as source:
                source.load()
                brand_image = source.convert("RGBA")
        except (OSError, UnidentifiedImageError):
            return

        brand_image.thumbnail((64, 64), Image.Resampling.LANCZOS)
        window_icon = brand_image.copy()
        header_logo = brand_image.copy()
        header_logo.thumbnail((56, 56), Image.Resampling.LANCZOS)
        self._window_icon_photo = ImageTk.PhotoImage(window_icon, master=self.root)
        self._header_logo_photo = ImageTk.PhotoImage(header_logo, master=self.root)
        try:
            self.root.iconphoto(True, self._window_icon_photo)
        except TclError:
            pass

    def _restore_window_maximized(self) -> None:
        try:
            self.root.state("zoomed")
        except TclError:
            pass

    def _remember_window_geometry(self, event: object | None = None) -> None:
        if (
            not self._initialize_runtime
            or self._is_closing
            or (event is not None and getattr(event, "widget", None) is not self.root)
        ):
            return
        try:
            if self.root.state() != "normal":
                return
            width = self.root.winfo_width()
            height = self.root.winfo_height()
            x = self.root.winfo_x()
            y = self.root.winfo_y()
        except TclError:
            return
        if width < 2 or height < 2:
            return
        self._last_normal_window_state = WindowState(
            width=width,
            height=height,
            x=x,
            y=y,
        )

    def _persist_window_geometry(self) -> None:
        if not self._initialize_runtime or self._window_state_saved:
            return
        self._window_state_saved = True
        self._remember_window_geometry()
        state = self._last_normal_window_state
        if state is None:
            return
        try:
            maximized = self.root.state() == "zoomed"
            save_window_state(
                WindowState(
                    width=state.width,
                    height=state.height,
                    x=state.x,
                    y=state.y,
                    maximized=maximized,
                ),
                self.window_state_path,
            )
        except (OSError, TclError, ValueError):
            pass

    def _build_layout(self) -> None:
        shell = ttk.Frame(self.root, padding=18, style="App.TFrame")
        shell.pack(fill="both", expand=True)
        shell.columnconfigure(0, weight=1)
        shell.rowconfigure(1, weight=1)

        header = ttk.Frame(shell, padding=(20, 14), style="Hero.TFrame")
        header.grid(row=0, column=0, sticky="ew", pady=(0, 14))
        header.columnconfigure(1, weight=1)

        if self._header_logo_photo is None:
            ttk.Label(
                header,
                text="CN",
                width=4,
                padding=(6, 7),
                style="HeroMark.TLabel",
            ).grid(row=0, column=0, rowspan=2, sticky="nsw", padx=(0, 12))
        else:
            ttk.Label(
                header,
                image=self._header_logo_photo,
                style="HeroLogo.TLabel",
            ).grid(row=0, column=0, rowspan=2, sticky="nsw", padx=(0, 14))
        ttk.Label(
            header,
            text="Campus Net",
            style="HeroTitle.TLabel",
        ).grid(row=0, column=1, sticky="sw")
        ttk.Label(
            header,
            text="校园网门户连接、配置与状态检查",
            style="HeroSubtitle.TLabel",
        ).grid(row=1, column=1, sticky="nw", pady=(1, 0))

        header_tools = ttk.Frame(header, style="Hero.TFrame")
        header_tools.grid(row=0, column=2, rowspan=2, sticky="e")
        self.header_status_icon_label = ttk.Label(
            header_tools,
            textvariable=self.status_icon_var,
            style="HeroStatus.TLabel",
        )
        self.header_status_icon_label.pack(side="left", padx=(0, 5))
        ttk.Label(
            header_tools,
            textvariable=self.header_status_var,
            style="HeroStatus.TLabel",
        ).pack(side="left", padx=(0, 14))
        ttk.Label(
            header_tools,
            text="外观",
            style="HeroSubtitle.TLabel",
        ).pack(side="left", padx=(0, 7))
        theme_combo = ttk.Combobox(
            header_tools,
            textvariable=self.theme_display_var,
            values=tuple(THEME_LABELS),
            width=6,
            state="readonly",
        )
        theme_combo.pack(side="left")
        theme_combo.bind("<<ComboboxSelected>>", self._change_theme)

        content = ttk.Frame(shell, style="App.TFrame")
        content.grid(row=1, column=0, sticky="nsew")
        content.columnconfigure(0, weight=3, uniform="content")
        content.columnconfigure(1, weight=2, uniform="content")
        content.rowconfigure(0, weight=1)

        form_border = ttk.Frame(content, padding=1, style="CardBorder.TFrame")
        form_border.grid(row=0, column=0, sticky="nsew", padx=(0, 7))
        form_border.columnconfigure(0, weight=1)
        form_border.rowconfigure(0, weight=1)
        form_panel = ttk.Frame(form_border, padding=18, style="Card.TFrame")
        form_panel.grid(row=0, column=0, sticky="nsew")
        form_panel.columnconfigure(0, weight=1)
        form_panel.rowconfigure(3, weight=1)

        heading = ttk.Frame(form_panel, style="Card.TFrame")
        heading.grid(row=0, column=0, sticky="ew")
        ttk.Label(heading, text="连接配置", style="CardTitle.TLabel").pack(anchor="w")
        ttk.Label(
            heading,
            text="选择门户协议并填写此设备的连接信息",
            style="CardSubtitle.TLabel",
        ).pack(anchor="w", pady=(2, 0))

        version_row = ttk.Frame(form_panel, padding=4, style="Panel.TFrame")
        version_row.grid(row=1, column=0, sticky="ew", pady=(14, 12))
        version_row.columnconfigure(0, weight=1)
        version_row.columnconfigure(1, weight=1)
        for value, label in ((2, "新版 captive SSO"), (1, "旧版 ePortal")):
            button = ttk.Radiobutton(
                version_row,
                text="新版 SSO（推荐）" if value == 2 else label,
                value=value,
                variable=self.version_var,
                command=self._show_version_form,
                bootstyle="primary-toolbutton",
                padding=(10, 7),
            )
            button.grid(
                row=0,
                column=0 if value == 2 else 1,
                sticky="ew",
                padx=(0, 3) if value == 2 else (3, 0),
            )
            self._version_buttons.append(button)

        ttk.Separator(form_panel).grid(row=2, column=0, sticky="ew", pady=(0, 12))

        self.form_stack = ScrolledFrame(
            form_panel,
            padding=(0, 0, 8, 0),
            autohide=False,
            height=240,
            width=500,
        )
        self.form_stack.grid(row=3, column=0, sticky="nsew")
        self.form_stack.columnconfigure(0, weight=1)
        self.form_stack.rowconfigure(0, weight=1)
        self.v2_frame = self._build_v2_form(self.form_stack)
        self.v1_frame = self._build_v1_form(self.form_stack)

        ttk.Separator(form_panel).grid(row=4, column=0, sticky="ew", pady=(12, 10))
        action_bar = ttk.Frame(form_panel, style="Card.TFrame")
        action_bar.grid(row=5, column=0, sticky="ew")
        action_bar.columnconfigure(0, weight=1)
        action_bar.columnconfigure(1, weight=1)
        self.save_button = ttk.Button(
            action_bar,
            text="保存配置",
            command=self._save_config,
            bootstyle="primary-outline",
            padding=(10, 7),
        )
        self.save_button.grid(row=0, column=0, sticky="ew", padx=(0, 5))
        self.reload_button = ttk.Button(
            action_bar,
            text="重新加载",
            command=self._load_config,
            bootstyle="secondary-outline",
            padding=(10, 7),
        )
        self.reload_button.grid(row=0, column=1, sticky="ew", padx=(5, 0))

        log_border = ttk.Frame(content, padding=1, style="CardBorder.TFrame")
        log_border.grid(row=0, column=1, sticky="nsew", padx=(7, 0))
        log_border.columnconfigure(0, weight=1)
        log_border.rowconfigure(0, weight=1)
        log_panel = ttk.Frame(log_border, padding=18, style="Card.TFrame")
        log_panel.grid(row=0, column=0, sticky="nsew")
        log_panel.columnconfigure(0, weight=1)
        log_panel.rowconfigure(6, weight=1)

        ttk.Label(log_panel, text="运行中心", style="CardTitle.TLabel").grid(
            row=0,
            column=0,
            sticky="w",
        )
        ttk.Label(
            log_panel,
            text="探测网络状态并执行校园网认证",
            style="CardSubtitle.TLabel",
        ).grid(row=1, column=0, sticky="w", pady=(2, 12))

        status_panel = ttk.Frame(log_panel, padding=(14, 11), style="Panel.TFrame")
        status_panel.grid(row=2, column=0, sticky="ew")
        status_panel.columnconfigure(0, weight=1)
        status_summary = ttk.Frame(status_panel, style="Panel.TFrame")
        status_summary.grid(row=0, column=0)
        self.status_icon_label = ttk.Label(
            status_summary,
            textvariable=self.status_icon_var,
            style="Info.StatusIcon.TLabel",
        )
        self.status_icon_label.pack(side="left", padx=(0, 7))
        self.status_label = ttk.Label(
            status_summary,
            textvariable=self.status_var,
            justify="center",
            wraplength=300,
            style="Info.StatusText.TLabel",
        )
        self.status_label.pack(side="left")
        ttk.Label(
            status_panel,
            text="详细过程与门户返回信息会记录在下方日志中",
            style="PanelMeta.TLabel",
        ).grid(row=1, column=0, pady=(2, 0))

        self.progress = ttk.Progressbar(log_panel, mode="indeterminate", bootstyle="success")
        self.progress.grid(row=3, column=0, sticky="ew", pady=(9, 0))

        self.run_bar = ttk.Frame(log_panel, style="Card.TFrame")
        self.run_bar.grid(row=4, column=0, sticky="ew", pady=(12, 13))
        self.run_bar.columnconfigure(0, weight=2)
        self.run_bar.columnconfigure(1, weight=1)
        self.connect_button = ttk.Button(
            self.run_bar,
            text="连接校园网",
            command=lambda: self._start_operation(probe_only=False),
            bootstyle="success",
            padding=(14, 9),
        )
        self.connect_button.grid(row=0, column=0, sticky="ew", padx=(0, 5))
        self.probe_button = ttk.Button(
            self.run_bar,
            text="只读探测",
            command=lambda: self._start_operation(probe_only=True),
            bootstyle="info-outline",
            padding=(12, 9),
        )
        self.probe_button.grid(row=0, column=1, sticky="ew", padx=(5, 0))
        self.cancel_button = ttk.Button(
            self.run_bar,
            text="取消当前操作",
            command=self._cancel_operation,
            bootstyle="danger-outline",
            padding=(14, 9),
        )
        self.cancel_button.grid(row=0, column=0, columnspan=2, sticky="ew")

        log_heading = ttk.Frame(log_panel, style="Card.TFrame")
        log_heading.grid(row=5, column=0, sticky="ew", pady=(0, 7))
        log_heading.columnconfigure(0, weight=1)
        ttk.Label(log_heading, text="过程日志", style="Field.TLabel").grid(
            row=0,
            column=0,
            sticky="w",
        )
        ttk.Button(
            log_heading,
            text="复制",
            command=self._copy_log,
            bootstyle="secondary-link",
            padding=(5, 2),
        ).grid(row=0, column=1, padx=(4, 0))
        ttk.Button(
            log_heading,
            text="清空",
            command=self._clear_log,
            bootstyle="secondary-link",
            padding=(5, 2),
        ).grid(row=0, column=2, padx=(2, 0))

        log_container = ttk.Frame(log_panel, style="Card.TFrame")
        log_container.grid(row=6, column=0, sticky="nsew")
        log_container.columnconfigure(0, weight=1)
        log_container.rowconfigure(0, weight=1)
        self.log_text = Text(
            log_container,
            wrap="word",
            relief="flat",
            borderwidth=0,
            padx=10,
            pady=10,
            font=("Cascadia Mono", 10),
            state="disabled",
        )
        self.log_text.grid(row=0, column=0, sticky="nsew")
        log_scrollbar = ttk.Scrollbar(
            log_container,
            orient="vertical",
            command=self.log_text.yview,
        )
        log_scrollbar.grid(row=0, column=1, sticky="ns")
        self.log_text.configure(yscrollcommand=log_scrollbar.set)

        path_row = ttk.Frame(shell, style="App.TFrame")
        path_row.grid(row=2, column=0, sticky="ew", pady=(12, 0))
        path_row.columnconfigure(1, weight=1)
        ttk.Label(path_row, text="配置文件", style="Footer.TLabel").grid(
            row=0,
            column=0,
            sticky="w",
            padx=(0, 10),
        )
        ttk.Entry(
            path_row,
            textvariable=self.config_path_var,
            state="readonly",
        ).grid(row=0, column=1, sticky="ew")
        ttk.Button(
            path_row,
            text="复制路径",
            command=self._copy_config_path,
            bootstyle="secondary-outline",
            padding=(9, 5),
        ).grid(row=0, column=2, padx=(8, 0))

    def _build_v2_form(self, parent: ttk.Frame) -> ttk.Frame:
        frame = ttk.Frame(parent, style="Card.TFrame")
        frame.columnconfigure(0, weight=1, uniform="v2-fields")
        frame.columnconfigure(1, weight=1, uniform="v2-fields")

        interface_field = ttk.Frame(frame, style="Card.TFrame")
        interface_field.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 8))
        interface_field.columnconfigure(0, weight=1)
        ttk.Label(
            interface_field,
            text="Windows IPv4 接口",
            style="Field.TLabel",
        ).grid(row=0, column=0, sticky="w", pady=(0, 4))
        interface_row = ttk.Frame(interface_field, style="Card.TFrame")
        interface_row.grid(row=1, column=0, sticky="ew")
        interface_row.columnconfigure(0, weight=1)
        self.interface_combo = ttk.Combobox(
            interface_row,
            textvariable=self.interface_display_var,
            state="normal",
        )
        self.interface_combo.grid(row=0, column=0, sticky="ew")
        self._guard_combobox_wheel(self.interface_combo)
        self.refresh_interfaces_button = ttk.Button(
            interface_row,
            text="刷新",
            command=self.refresh_interfaces,
            bootstyle="secondary-outline",
            width=7,
            padding=(7, 6),
        )
        self.refresh_interfaces_button.grid(row=0, column=1, padx=(8, 0))
        self.interface_combo.bind("<<ComboboxSelected>>", self._update_interface_summary)
        self.interface_combo.bind("<FocusOut>", self._update_interface_summary)

        interface_summary = ttk.Frame(interface_field, style="Card.TFrame")
        interface_summary.grid(row=2, column=0, sticky="ew", pady=(6, 0))
        self.interface_status_label = ttk.Label(
            interface_summary,
            textvariable=self.interface_status_var,
            style="Secondary.Interface.TLabel",
        )
        self.interface_status_label.pack(side="left")
        ttk.Label(
            interface_summary,
            textvariable=self.interface_meta_var,
            style="CardSubtitle.TLabel",
        ).pack(side="left", padx=(9, 0))

        self._add_entry(
            frame,
            1,
            0,
            "门户根地址",
            self.v2_vars["portal_url"],
            columnspan=2,
        )
        self._add_entry(
            frame,
            2,
            0,
            "校园网账号",
            self.v2_vars["username"],
            padx=(0, 6),
        )
        password_entry = self._add_entry(
            frame,
            2,
            1,
            "校园网密码",
            self.v2_vars["password"],
            show="•",
            padx=(6, 0),
        )
        self._secret_entries.append(password_entry)
        self.v2_carrier_combo = self._add_combobox(
            frame,
            3,
            0,
            "运营商",
            self.v2_vars["carrier"],
            values=CARRIERS,
            padx=(0, 6),
        )
        self._add_secret_toggle(
            frame,
            3,
            1,
            text="显示密码",
            padx=(6, 0),
        )
        self._add_form_hint(
            frame,
            4,
            text="接口可以是 Wi-Fi、以太网或其他 IPv4 网卡；也可直接填写接口索引。",
        )
        return frame

    def _build_v1_form(self, parent: ttk.Frame) -> ttk.Frame:
        frame = ttk.Frame(parent, style="Card.TFrame")
        frame.columnconfigure(0, weight=1, uniform="v1-fields")
        frame.columnconfigure(1, weight=1, uniform="v1-fields")

        self._add_entry(
            frame,
            0,
            0,
            "登录地址",
            self.v1_vars["login_url"],
            columnspan=2,
        )
        self._add_entry(
            frame,
            1,
            0,
            "校园网账号",
            self.v1_vars["username"],
            padx=(0, 6),
        )
        password_entry = self._add_entry(
            frame,
            1,
            1,
            "加密密码",
            self.v1_vars["encrypted_password"],
            show="•",
            padx=(6, 0),
        )
        self._secret_entries.append(password_entry)
        self._add_entry(
            frame,
            2,
            0,
            "运营商",
            self.v1_vars["carrier"],
            padx=(0, 6),
        )
        self._add_entry(
            frame,
            2,
            1,
            "用户组（可选）",
            self.v1_vars["user_group"],
            padx=(6, 0),
        )
        session_entry = self._add_entry(
            frame,
            3,
            0,
            "会话 ID（可选）",
            self.v1_vars["session_id"],
            show="•",
            columnspan=2,
        )
        self._secret_entries.append(session_entry)
        self._add_secret_toggle(
            frame,
            4,
            0,
            text="显示敏感字段",
            columnspan=2,
        )
        self._add_form_hint(
            frame,
            5,
            text="旧版使用门户生成的 encrypted_password，不接受新版明文密码。",
        )
        return frame

    def _add_entry(
        self,
        parent: ttk.Frame,
        row: int,
        column: int,
        label: str,
        variable: StringVar,
        *,
        show: str | None = None,
        columnspan: int = 1,
        padx: tuple[int, int] = (0, 0),
    ) -> ttk.Entry:
        field = ttk.Frame(parent, style="Card.TFrame")
        field.grid(
            row=row,
            column=column,
            columnspan=columnspan,
            sticky="ew",
            padx=padx,
            pady=(0, 8),
        )
        ttk.Label(field, text=label, style="Field.TLabel").pack(anchor="w")
        entry = ttk.Entry(field, textvariable=variable, show=show or "")
        entry.pack(fill="x", pady=(4, 0))
        return entry

    def _add_secret_toggle(
        self,
        parent: ttk.Frame,
        row: int,
        column: int,
        *,
        text: str,
        columnspan: int = 1,
        padx: tuple[int, int] = (0, 0),
    ) -> None:
        field = ttk.Frame(parent, style="Card.TFrame")
        field.grid(
            row=row,
            column=column,
            columnspan=columnspan,
            sticky="nsew",
            padx=padx,
            pady=(0, 8),
        )
        ttk.Label(field, text="敏感信息", style="Field.TLabel").pack(anchor="w")
        toggle_border = ttk.Frame(field, padding=1, style="ToggleBorder.TFrame")
        toggle_border.pack(fill="x", pady=(4, 0))
        toggle_control = ttk.Frame(
            toggle_border,
            padding=(9, 8),
            style="ToggleControl.TFrame",
        )
        toggle_control.pack(fill="x")
        ttk.Checkbutton(
            toggle_control,
            text=text,
            variable=self.show_secrets_var,
            command=self._toggle_secrets,
            bootstyle="primary-square-toggle",
        ).pack(anchor="w")

    def _add_combobox(
        self,
        parent: ttk.Frame,
        row: int,
        column: int,
        label: str,
        variable: StringVar,
        *,
        values: tuple[str, ...],
        columnspan: int = 1,
        padx: tuple[int, int] = (0, 0),
    ) -> ttk.Combobox:
        field = ttk.Frame(parent, style="Card.TFrame")
        field.grid(
            row=row,
            column=column,
            columnspan=columnspan,
            sticky="ew",
            padx=padx,
            pady=(0, 8),
        )
        ttk.Label(field, text=label, style="Field.TLabel").pack(anchor="w")
        combobox = ttk.Combobox(
            field,
            textvariable=variable,
            values=values,
            state="readonly",
        )
        combobox.pack(fill="x", pady=(4, 0))
        self._guard_combobox_wheel(combobox)
        return combobox

    @staticmethod
    def _stop_combobox_wheel(_event: object) -> str:
        return "break"

    @staticmethod
    def _guard_combobox_wheel(combobox: ttk.Combobox) -> None:
        bindtags = combobox.bindtags()
        if COMBOBOX_WHEEL_GUARD_TAG in bindtags:
            return
        combobox.bindtags((bindtags[0], COMBOBOX_WHEEL_GUARD_TAG, *bindtags[1:]))

    def _add_form_hint(self, parent: ttk.Frame, row: int, *, text: str) -> None:
        hint = ttk.Label(
            parent,
            text=text,
            justify="left",
            style="CardSubtitle.TLabel",
        )
        hint.grid(row=row, column=0, columnspan=2, sticky="ew", pady=(1, 0))

        def resize_hint(event: object) -> None:
            width = getattr(event, "width", 0)
            if isinstance(width, int) and width > 40:
                hint.configure(wraplength=max(240, width - 12))

        parent.bind("<Configure>", resize_hint, add="+")

    def _show_version_form(self) -> None:
        version = self.version_var.get()
        if version == 2:
            self.v2_frame.grid(row=0, column=0, sticky="nsew")
            self.v1_frame.grid_remove()
        else:
            self.v1_frame.grid(row=0, column=0, sticky="nsew")
            self.v2_frame.grid_remove()
        self._update_controls()

    def _toggle_secrets(self) -> None:
        show = "" if self.show_secrets_var.get() else "•"
        for entry in self._secret_entries:
            entry.configure(show=show)

    def _change_theme(self, _event: object | None = None) -> None:
        theme = THEME_LABELS.get(self.theme_display_var.get(), self.theme_var.get())
        if theme not in THEMES:
            return
        self.theme_var.set(theme)
        self.theme_display_var.set(
            next(label for label, value in THEME_LABELS.items() if value == theme)
        )
        self.root.style.theme_use(theme)
        self._configure_styles()
        self._apply_text_theme()

    def _apply_text_theme(self) -> None:
        colors = self.root.style.colors
        is_dark = self.theme_var.get() == "darkly"
        muted_foreground = colors.light if is_dark else colors.dark
        self.log_text.configure(
            background=colors.inputbg,
            foreground=colors.inputfg,
            insertbackground=colors.inputfg,
            selectbackground=colors.selectbg,
            selectforeground=colors.selectfg,
        )
        self.log_text.tag_configure("timestamp", foreground=muted_foreground)
        self.log_text.tag_configure("message", foreground=colors.inputfg)
        self.root.style.configure(
            "primary.Square.Toggle",
            background=colors.inputbg,
            foreground=colors.inputfg,
        )
        self.root.style.map(
            "primary.Square.Toggle",
            background=[
                ("active", colors.inputbg),
                ("disabled", colors.inputbg),
            ],
            foreground=[("disabled", muted_foreground)],
        )
        self.root.style.configure(
            "primary.Toolbutton",
            background=colors.inputbg if is_dark else colors.light,
            foreground=colors.fg,
            bordercolor=colors.border,
            lightcolor=colors.border,
            darkcolor=colors.border,
        )

    def _load_config(self) -> None:
        if self._active_operation_id is not None:
            return
        if not self.config_path.exists():
            self._revision = ConfigRevision.absent()
            self._save_allowed = True
            self._set_status("尚未创建配置，可填写后保存", "info")
            self._append_log(f"将新建配置：{self.config_path}")
            self._update_controls()
            return

        try:
            loaded = load_editable_config(self.config_path)
            version, values = form_values_from_config(loaded.config)
        except (ConfigStoreError, OSError, TypeError, ValueError) as error:
            self._save_allowed = False
            self._set_status("配置加载失败，已禁止覆盖", "danger")
            self._append_log(f"配置加载失败：{error}")
            self._update_controls()
            return

        self._revision = loaded.revision
        self._save_allowed = True
        self._apply_form_values(version, values)
        self._set_status(f"已加载 version={version} 配置", "success")
        self._append_log(f"已加载配置：{loaded.path}")
        self._update_controls()

    def _apply_form_values(self, version: int, values: dict[str, str]) -> None:
        self.version_var.set(version)
        if version == 2:
            self.interface_display_var.set(values["interface_index"])
            for key, variable in self.v2_vars.items():
                variable.set(values[key])
            self._update_interface_summary()
        else:
            for key, variable in self.v1_vars.items():
                variable.set(values[key])
        self._show_version_form()

    def _collect_config(self) -> EditableConfig:
        version = self.version_var.get()
        if version == 2:
            interface_text = self.interface_display_var.get().strip()
            interface_index = self._interface_by_display.get(interface_text)
            if interface_index is None:
                interface_index_text = interface_text.split("·", 1)[0].strip()
            else:
                interface_index_text = str(interface_index)
            values = {
                "interface_index": interface_index_text,
                **{key: variable.get() for key, variable in self.v2_vars.items()},
            }
        else:
            values = {key: variable.get() for key, variable in self.v1_vars.items()}
        return build_config_from_form(version, values)

    def _save_config(self) -> None:
        if not self._save_allowed or self._active_operation_id is not None:
            return
        try:
            config = self._collect_config()
            receipt = save_editable_config(
                config,
                path=self.config_path,
                backup_dir=self.backup_directory,
                expected_revision=self._revision,
            )
        except ConfigRevisionError as error:
            self._save_allowed = False
            self._set_status("配置已被其他程序修改，请重新加载", "warning")
            self._append_log(f"保存已停止：{error}")
            messagebox.showwarning("保存已停止", str(error), parent=self.root)
        except ConfigCommitUncertainError as error:
            self._save_allowed = False
            self._set_status("写入后的文件状态无法确认，请重新加载", "danger")
            self._append_log(f"配置替换后的落盘状态无法确认：{error}")
            if error.backup is not None:
                self._append_log(f"可用于恢复的原配置备份：{error.backup.path}")
            messagebox.showerror(
                "保存状态不确定",
                "配置已执行原子替换，但最终落盘状态无法确认。请重新加载配置并检查备份目录。",
                parent=self.root,
            )
        except ConfigIntegrityError as error:
            self._set_status("完整性校验失败，已停止覆盖", "danger")
            self._append_log(f"保存已在替换前停止：{error}")
            messagebox.showerror(
                "保存已停止",
                "配置或备份的完整性校验失败，旧配置未被覆盖。",
                parent=self.root,
            )
        except (ConfigStoreError, OSError, TypeError, ValueError) as error:
            self._set_status("配置保存失败", "danger")
            self._append_log(f"配置保存失败：{error}")
            messagebox.showerror("配置保存失败", str(error), parent=self.root)
        else:
            self._revision = receipt.revision
            if not receipt.changed:
                self._set_status("配置内容没有变化", "info")
                self._append_log("配置内容没有变化，未覆盖文件，也未创建备份。")
            elif receipt.backup is None:
                self._set_status("配置已创建", "success")
                self._append_log(f"已创建配置：{receipt.path}")
            else:
                self._set_status("配置已备份并保存", "success")
                self._append_log(f"原配置备份：{receipt.backup.path}")
                self._append_log(f"已原子保存配置：{receipt.path}")
        finally:
            self._update_controls()

    def _start_operation(self, *, probe_only: bool) -> None:
        if self._active_operation_id is not None:
            return
        if probe_only and self.version_var.get() == 1:
            self._set_status("旧版 ePortal 不支持独立探测", "warning")
            return
        try:
            config = self._collect_config()
            operation_id = self.controller.start(config, probe_only=probe_only)
        except (ConfigStoreError, OSError, TypeError, ValueError, RuntimeError) as error:
            self._set_status("无法启动操作", "danger")
            self._append_log(f"无法启动操作：{error}")
            return

        self._active_operation_id = operation_id
        action = "只读探测" if probe_only else "连接"
        self._set_status(f"正在执行{action}", "info")
        self._append_log(f"开始{action}，配置版本 {self.version_var.get()}。")
        self.progress.start(12)
        self._update_controls()

    def _cancel_operation(self) -> None:
        if self._active_operation_id is None:
            return
        if self.controller.cancel():
            self._set_status("正在取消操作…", "warning")
            self._append_log("已请求取消；正在提交的请求可能已被服务端处理。")
            self.cancel_button.configure(state="disabled")

    def refresh_interfaces(self) -> None:
        if self._interface_loading:
            return
        self._interface_loading = True
        self.refresh_interfaces_button.configure(state="disabled")
        self._set_interface_status(
            "正在读取网络接口",
            "info",
            "正在查询 Windows IPv4 路由接口",
        )
        self._append_log("正在读取 Windows IPv4 接口…")
        thread = threading.Thread(
            target=self._load_interfaces_in_worker,
            name="campus-net-interface-list",
            daemon=True,
        )
        try:
            thread.start()
        except (OSError, RuntimeError) as error:
            self._interface_loading = False
            self._set_interface_status(
                "无法读取网络接口",
                "danger",
                "后台读取任务未能启动",
            )
            self._append_log(f"无法启动网卡读取任务：{error}")
            self._update_controls()

    def _load_interfaces_in_worker(self) -> None:
        try:
            interfaces = tuple(list_windows_ipv4_interfaces())
        except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
            result = _InterfaceResult(error=str(error))
        else:
            result = _InterfaceResult(interfaces=interfaces)
        self._interface_results.put(result)

    def _handle_interface_result(self, result: _InterfaceResult) -> None:
        self._interface_loading = False
        if result.error is not None:
            self._set_interface_status(
                "网络接口读取失败",
                "danger",
                "可手动填写 Windows IPv4 接口索引",
            )
            self._append_log(f"网卡列表读取失败：{result.error}")
            self._update_controls()
            return

        current_index = self._current_interface_index()
        self._interface_details_by_display = {
            interface.display_name: interface for interface in result.interfaces
        }
        self._interface_by_display = {
            interface.display_name: interface.index for interface in result.interfaces
        }
        displays = tuple(self._interface_by_display)
        self.interface_combo.configure(values=displays)
        matching_display = next(
            (
                display
                for display, index in self._interface_by_display.items()
                if index == current_index
            ),
            None,
        )
        if matching_display is not None:
            self.interface_display_var.set(matching_display)
        elif not self.interface_display_var.get().strip() and displays:
            self.interface_display_var.set(displays[0])
        self._update_interface_summary()
        self._append_log(f"已读取 {len(displays)} 个 IPv4 接口。")
        self._update_controls()

    def _update_interface_summary(self, _event: object | None = None) -> None:
        display = self.interface_display_var.get().strip()
        interface = self._interface_details_by_display.get(display)
        if interface is None:
            interface_index = self._current_interface_index()
            if interface_index is None:
                self._set_interface_status(
                    "尚未选择网络接口",
                    "secondary",
                    "刷新列表或直接填写 IPv4 接口索引",
                )
            else:
                self._set_interface_status(
                    "使用手动接口索引",
                    "info",
                    f"IPv4 接口索引 {interface_index}",
                )
            return

        state = interface.state.casefold()
        if state == "connected":
            message, style = "接口已连接", "success"
        elif state == "disconnected":
            message, style = "接口未连接", "secondary"
        elif state == "authenticating":
            message, style = "接口正在认证", "warning"
        else:
            message, style = interface.state or "接口状态未知", "warning"
        self._set_interface_status(
            message,
            style,
            f"接口索引 {interface.index} · 路由跃点 {interface.metric}",
        )

    def _set_interface_status(self, message: str, style: str, meta: str) -> None:
        if style not in STATUS_ICONS:
            style = "secondary"
        self._interface_status_style = style
        self.interface_status_var.set(f"{STATUS_ICONS[style]} {message}")
        self.interface_meta_var.set(meta)
        if hasattr(self, "interface_status_label"):
            self.interface_status_label.configure(style=f"{style.title()}.Interface.TLabel")

    def _current_interface_index(self) -> int | None:
        value = self.interface_display_var.get().strip()
        mapped = self._interface_by_display.get(value)
        if mapped is not None:
            return mapped
        try:
            return int(value.split("·", 1)[0].strip())
        except ValueError:
            return None

    def _poll_events(self) -> None:
        self._poll_after_id = None
        try:
            while True:
                self._handle_interface_result(self._interface_results.get_nowait())
        except Empty:
            pass

        for event in self.controller.drain_events():
            if event.operation_id != self._active_operation_id:
                continue
            if isinstance(event, LogEvent):
                self._append_log(event.message)
            elif isinstance(event, CaptchaRequested):
                if not self._is_closing:
                    self._show_captcha(event)
            elif isinstance(event, FailedEvent):
                self._finish_operation(event.message, style="danger")
                self._append_log(f"{event.title}：{event.message}")
            elif isinstance(event, FinishedEvent):
                style = self._terminal_style(event)
                self._finish_operation(event.message, style=style)
                self._append_log(event.message)

        if self._is_closing and not self.controller.is_running:
            self._destroy_root()
            return
        if self._is_closing and time.monotonic() >= self._close_deadline:
            self._destroy_root()
            return
        self._schedule_event_poll()

    def _schedule_event_poll(self) -> None:
        if self._poll_after_id is not None:
            return
        try:
            self._poll_after_id = self.root.after(50, self._poll_events)
        except TclError:
            self._poll_after_id = None

    def _terminal_style(self, event: FinishedEvent) -> str:
        if event.cancelled or event.exit_code in {2, 4}:
            return "warning"
        return "success" if event.exit_code == 0 else "danger"

    def _finish_operation(self, message: str, *, style: str) -> None:
        self.progress.stop()
        self._active_operation_id = None
        self._close_captcha()
        self._set_status(message, style)
        self._update_controls()

    def _show_captcha(self, event: CaptchaRequested) -> None:
        self._close_captcha()
        try:
            with Image.open(BytesIO(event.image_bytes)) as source:
                source.load()
                captcha_image = source.convert("RGB")
        except (OSError, UnidentifiedImageError) as error:
            self._append_log(f"验证码图片无效：{error}")
            self.controller.cancel()
            self._set_status("验证码图片无效，正在取消", "danger")
            return

        captcha_image.thumbnail((560, 280), Image.Resampling.LANCZOS)
        window = Toplevel(self.root)
        window.title("校园网图形验证码")
        window.resizable(False, False)
        window.transient(self.root)
        window.configure(background=self.root.style.colors.bg)

        body = ttk.Frame(window, padding=20, style="Card.TFrame")
        body.pack(fill="both", expand=True)
        ttk.Label(
            body,
            text="门户需要图形验证码",
            style="CardTitle.TLabel",
        ).pack(anchor="w")
        ttk.Label(
            body,
            text="只需填写图片内容，其余登录表单仍由程序自动提交。",
            style="CardSubtitle.TLabel",
        ).pack(anchor="w", pady=(2, 12))

        photo = ImageTk.PhotoImage(captcha_image, master=window)
        image_border = ttk.Frame(body, padding=1, style="CardBorder.TFrame")
        image_border.pack(fill="x", pady=(0, 13))
        ttk.Label(image_border, image=photo, anchor="center").pack(fill="x")
        code_var = StringVar(master=window)
        ttk.Label(body, text="验证码", style="Field.TLabel").pack(anchor="w")
        entry = ttk.Entry(body, textvariable=code_var, justify="center", width=28)
        entry.pack(fill="x", pady=(4, 0))
        validation_var = StringVar(master=window)
        ttk.Label(body, textvariable=validation_var, bootstyle="danger").pack(
            anchor="w",
            pady=(4, 0),
        )

        button_row = ttk.Frame(body, style="Card.TFrame")
        button_row.pack(fill="x", pady=(12, 0))

        def submit() -> None:
            code = code_var.get().strip()
            if not code:
                validation_var.set("请输入验证码")
                entry.focus_set()
                return
            accepted = self.controller.answer_captcha(
                event.operation_id,
                event.request_id,
                code,
            )
            if accepted:
                self._append_log("验证码已提交，等待门户校验。")
                self._close_captcha()
                self._set_status("验证码已提交，正在校验", "info")
            else:
                validation_var.set("验证码请求已失效")

        def cancel() -> None:
            self._close_captcha()
            self._cancel_operation()

        ttk.Button(
            button_row,
            text="提交验证码",
            command=submit,
            bootstyle="success",
            padding=(12, 8),
        ).pack(side="left", fill="x", expand=True, padx=(0, 5))
        ttk.Button(
            button_row,
            text="取消连接",
            command=cancel,
            bootstyle="danger-outline",
            padding=(12, 8),
        ).pack(side="left", fill="x", expand=True, padx=(5, 0))

        window.bind("<Return>", lambda _event: submit())
        window.protocol("WM_DELETE_WINDOW", cancel)
        self._center_child_window(window)
        window.grab_set()
        entry.focus_force()
        self._captcha_dialog = _CaptchaDialog(
            operation_id=event.operation_id,
            request_id=event.request_id,
            window=window,
            photo=photo,
        )
        self._set_status("等待输入图形验证码", "warning")
        self._append_log("门户要求图形验证码。")

    def _center_child_window(self, window: Toplevel) -> None:
        try:
            window.update_idletasks()
            width = window.winfo_reqwidth()
            height = window.winfo_reqheight()
            parent_x = self.root.winfo_rootx()
            parent_y = self.root.winfo_rooty()
            parent_width = self.root.winfo_width()
            parent_height = self.root.winfo_height()
        except TclError:
            return

        x = parent_x + (parent_width - width) // 2
        y = parent_y + (parent_height - height) // 2
        parent_center_x = parent_x + parent_width // 2
        parent_center_y = parent_y + parent_height // 2
        work_areas = _screen_work_areas(self.root)
        target_area = next(
            (
                area
                for area in work_areas
                if area.left <= parent_center_x < area.right
                and area.top <= parent_center_y < area.bottom
            ),
            work_areas[0],
        )
        x = min(max(x, target_area.left), target_area.right - width)
        y = min(max(y, target_area.top), target_area.bottom - height)
        window.geometry(f"+{x}+{y}")

    def _close_captcha(self) -> None:
        dialog = self._captcha_dialog
        self._captcha_dialog = None
        if dialog is None:
            return
        try:
            dialog.window.grab_release()
        except Exception:
            pass
        if dialog.window.winfo_exists():
            dialog.window.destroy()

    def _copy_log(self) -> None:
        try:
            content = self.log_text.get("1.0", "end-1c")
            if not content:
                return
            self.root.clipboard_clear()
            self.root.clipboard_append(content)
        except TclError:
            return

    def _clear_log(self) -> None:
        try:
            self.log_text.configure(state="normal")
            self.log_text.delete("1.0", "end")
            self.log_text.configure(state="disabled")
        except TclError:
            return

    def _copy_config_path(self) -> None:
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(self.config_path_var.get())
        except TclError:
            return

    def _append_log(self, message: str) -> None:
        normalized = " ".join(str(message).split())
        if not normalized:
            return
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_text.configure(state="normal")
        self.log_text.insert("end", f"{timestamp}  ", "timestamp")
        self.log_text.insert("end", f"{normalized}\n", "message")
        line_count = int(self.log_text.index("end-1c").split(".", 1)[0])
        if line_count > MAX_LOG_LINES:
            self.log_text.delete("1.0", f"{line_count - MAX_LOG_LINES}.0")
        self.log_text.configure(state="disabled")
        self.log_text.see("end")

    def _set_status(self, message: str, style: str) -> None:
        if style not in STATUS_ICONS:
            style = "info"
        self._status_style = style
        self.status_var.set(message)
        self.header_status_var.set(message if len(message) <= 16 else f"{message[:15]}…")
        self.status_icon_var.set(STATUS_ICONS[style])
        if hasattr(self, "status_icon_label"):
            self.status_icon_label.configure(style=f"{style.title()}.StatusIcon.TLabel")
        if hasattr(self, "status_label"):
            self.status_label.configure(style=f"{style.title()}.StatusText.TLabel")

    def _update_controls(self) -> None:
        is_busy = self._active_operation_id is not None
        normal_when_idle = "disabled" if is_busy else "normal"
        for button in self._version_buttons:
            button.configure(state=normal_when_idle)
        self.connect_button.configure(state=normal_when_idle)
        self.reload_button.configure(state=normal_when_idle)
        self.save_button.configure(
            state="normal" if self._save_allowed and not is_busy else "disabled"
        )
        self.probe_button.configure(
            state=("normal" if not is_busy and self.version_var.get() == 2 else "disabled")
        )
        self.cancel_button.configure(state="normal" if is_busy else "disabled")
        self.refresh_interfaces_button.configure(
            state="disabled" if is_busy or self._interface_loading else "normal"
        )
        if is_busy:
            self.connect_button.grid_remove()
            self.probe_button.grid_remove()
            self.cancel_button.grid()
            self.progress.grid()
        else:
            self.cancel_button.grid_remove()
            self.connect_button.grid()
            self.probe_button.grid()
            self.progress.grid_remove()

    def _request_close(self) -> None:
        if self._is_closing:
            return
        if self._active_operation_id is None:
            self._destroy_root()
            return
        self._is_closing = True
        self._close_deadline = time.monotonic() + 3
        self._close_captcha()
        self.controller.cancel()
        self._set_status("正在停止后台操作…", "warning")
        self._update_controls()

    def _destroy_root(self) -> None:
        self._persist_window_geometry()
        self._close_captcha()
        poll_after_id = self._poll_after_id
        self._poll_after_id = None
        if poll_after_id is not None:
            try:
                self.root.after_cancel(poll_after_id)
            except TclError:
                pass
        try:
            if self.root.winfo_exists():
                self.root.destroy()
        except TclError:
            pass


def default_backup_directory() -> Path:
    if sys.platform == "win32":
        shell32 = getattr(getattr(ctypes, "windll", None), "shell32", None)
        if shell32 is not None:
            buffer = ctypes.create_unicode_buffer(260)
            if shell32.SHGetFolderPathW(None, 5, None, 0, buffer) == 0 and buffer.value:
                return Path(buffer.value) / "CampusNet Backups"
    return Path.home() / "Documents" / "CampusNet Backups"


def default_window_state_path() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        base_directory = Path(local_app_data)
    else:
        base_directory = Path.home() / "AppData" / "Local"
    return base_directory / "Cedarflake" / "CampusNet" / "window-state.json"


def app_icon_path() -> Path:
    bundle_directory = getattr(sys, "_MEIPASS", None)
    if isinstance(bundle_directory, (str, os.PathLike)):
        base_directory = Path(bundle_directory)
    else:
        base_directory = Path(__file__).resolve().parent.parent
    return base_directory / "assets" / "app-icon.png"


def select_config_path(config_path: Path | None) -> Path:
    if config_path is not None:
        return config_path.expanduser().absolute()
    try:
        return resolve_config_path()
    except FileNotFoundError:
        if getattr(sys, "frozen", False):
            executable_directory = Path(sys.executable).absolute().parent
            project_root = packaged_project_root(sys.executable)
            if project_root is not None:
                return project_root / "config.json"
            return executable_directory / "config.json"
        return Path(__file__).resolve().parent.parent / "config.json"


def _screen_work_areas(root: ttk.Window) -> tuple[ScreenRect, ...]:
    if sys.platform == "win32":
        try:
            areas = _windows_work_areas()
        except (AttributeError, OSError, TypeError, ValueError, ctypes.ArgumentError):
            areas = ()
        if areas:
            return areas
    return (
        ScreenRect(
            left=0,
            top=0,
            right=root.winfo_screenwidth(),
            bottom=root.winfo_screenheight(),
        ),
    )


def _windows_work_areas() -> tuple[ScreenRect, ...]:
    class _Rect(ctypes.Structure):
        _fields_ = [
            ("left", ctypes.c_long),
            ("top", ctypes.c_long),
            ("right", ctypes.c_long),
            ("bottom", ctypes.c_long),
        ]

    class _MonitorInfo(ctypes.Structure):
        _fields_ = [
            ("size", ctypes.c_ulong),
            ("monitor", _Rect),
            ("work", _Rect),
            ("flags", ctypes.c_ulong),
        ]

    user32 = ctypes.windll.user32
    monitor_callback_type = ctypes.WINFUNCTYPE(
        ctypes.c_int,
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.POINTER(_Rect),
        ctypes.c_ssize_t,
    )
    user32.GetMonitorInfoW.argtypes = [
        ctypes.c_void_p,
        ctypes.POINTER(_MonitorInfo),
    ]
    user32.GetMonitorInfoW.restype = ctypes.c_int
    user32.EnumDisplayMonitors.argtypes = [
        ctypes.c_void_p,
        ctypes.c_void_p,
        monitor_callback_type,
        ctypes.c_ssize_t,
    ]
    user32.EnumDisplayMonitors.restype = ctypes.c_int
    discovered: list[tuple[bool, ScreenRect]] = []

    @monitor_callback_type
    def collect_monitor(
        monitor: int,
        _device_context: int,
        _monitor_rect: ctypes.POINTER(_Rect),
        _data: int,
    ) -> int:
        info = _MonitorInfo(size=ctypes.sizeof(_MonitorInfo))
        if user32.GetMonitorInfoW(monitor, ctypes.byref(info)):
            discovered.append(
                (
                    bool(info.flags & 1),
                    ScreenRect(
                        left=info.work.left,
                        top=info.work.top,
                        right=info.work.right,
                        bottom=info.work.bottom,
                    ),
                )
            )
        return 1

    if not user32.EnumDisplayMonitors(None, None, collect_monitor, 0):
        raise OSError("无法枚举 Windows 显示器")
    return tuple(area for _primary, area in sorted(discovered, key=lambda item: not item[0]))


def launch_gui(*, config_path: Path | None = None, smoke_test: bool = False) -> None:
    root = ttk.Window(themename="darkly")
    if smoke_test:
        root.withdraw()
        selected_path = (
            config_path.expanduser().absolute()
            if config_path is not None
            else Path.cwd().absolute() / "config.json"
        )
        app = CampusNetApp(root, config_path=selected_path, initialize_runtime=False)
        root.update_idletasks()
        root.update()
        app._destroy_root()
        return

    CampusNetApp(root, config_path=select_config_path(config_path))
    root.mainloop()
