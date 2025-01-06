# WentUrc_ASCII_Art_Tool.spec

# -*- mode: python ; coding: utf-8 -*-

import os
import sys

block_cipher = None

# 获取 Spec 文件所在的目录
spec_dir = os.path.dirname(os.path.abspath(__name__))

a = Analysis(
    [os.path.join(spec_dir, 'WentUrc_ASCII_Art_Tool', 'main.py')],
    pathex=[spec_dir],
    binaries=[],
    datas=[
        (os.path.join(spec_dir, 'configs', 'config.yaml'), 'configs'),
        (os.path.join(spec_dir, 'ffmpeg', 'ffmpeg.exe'), 'ffmpeg'),
    ],
    hiddenimports=[
        # 添加需要隐藏导入的模块
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='WentUrc_ASCII_Art_Tool',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # 如果是命令行工具，设置为 True；如果是 GUI 应用，设置为 False
    icon=os.path.join(spec_dir, 'logo-O1.ico')  # 确保图标路径正确
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='WentUrc_ASCII_Art_Tool'
)
