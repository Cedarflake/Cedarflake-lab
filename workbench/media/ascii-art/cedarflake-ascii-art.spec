# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path


project_dir = Path(SPECPATH)
ffmpeg_executable = project_dir / "ffmpeg" / "ffmpeg.exe"
data_files = [(str(project_dir / "configs" / "config.example.yaml"), "configs")]
if ffmpeg_executable.is_file():
    data_files.append((str(ffmpeg_executable), "ffmpeg"))

a = Analysis(
    [str(project_dir / "cedarflake_ascii_art" / "main.py")],
    pathex=[str(project_dir)],
    binaries=[],
    datas=data_files,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Cedarflake-ASCII-Art",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    icon=str(project_dir / "logo-O1.ico"),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="Cedarflake-ASCII-Art",
)
