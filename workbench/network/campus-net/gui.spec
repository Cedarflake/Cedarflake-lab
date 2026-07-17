# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ["gui_main.py"],
    pathex=[],
    binaries=[],
    datas=[("assets/app-icon.png", "assets")],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="Auto-Connect-CampusNet-GUI",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    icon="assets/app-icon.ico",
    codesign_identity=None,
    entitlements_file=None,
)
