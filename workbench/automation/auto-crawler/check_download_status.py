#!/usr/bin/env python3
"""
检查下载状态和数据库记录
"""

import asyncio
import os
from pathlib import Path

import aiosqlite


async def check_download_status():
    """检查下载状态"""
    print("🐱 检查下载状态和数据库记录 喵♡～\n")

    # 导入模块
    import sys

    sys.path.insert(0, ".")
    from utils.persistence import get_db

    # 检查文件系统中的下载文件
    downloads_path = Path("./downloads")
    if downloads_path.exists():
        files = list(downloads_path.rglob("*.*"))
        print("📁 文件系统中的下载文件:")
        print(f"   - 总文件数: {len(files)}")

        total_size = 0
        for file_path in files:
            if file_path.is_file():
                size = file_path.stat().st_size
                total_size += size
                print(f"   - {file_path.relative_to(downloads_path)} ({size / 1024:.1f}KB)")

        print(f"   - 总大小: {total_size / 1024 / 1024:.2f}MB\n")
    else:
        print("❌ downloads目录不存在\n")

    # 检查数据库记录
    try:
        db = await get_db()
        await db.initialize()  # 确保数据库初始化

        # 检查下载记录总数
        async with aiosqlite.connect(db.db_path) as conn:
            cursor = await conn.execute("SELECT COUNT(*) FROM download_history")
            count = await cursor.fetchone()
            print(f"📊 数据库中的下载记录: {count[0]} 条")

            # 检查各状态的记录数
            cursor = await conn.execute("""
                SELECT status, COUNT(*) as count, SUM(file_size) as total_size
                FROM download_history
                GROUP BY status
            """)
            status_records = await cursor.fetchall()
            print("📋 按状态分组:")
            for status, count, total_size in status_records:
                size_mb = (total_size or 0) / 1024 / 1024
                print(f"   - {status}: {count} 条 ({size_mb:.2f}MB)")

            # 检查最近的下载记录
            cursor = await conn.execute("""
                SELECT image_url, local_path, status, file_size, download_time
                FROM download_history
                ORDER BY download_time DESC
                LIMIT 5
            """)
            recent_records = await cursor.fetchall()
            print("\n📝 最近5条下载记录:")
            for i, (url, path, status, size, time) in enumerate(recent_records, 1):
                filename = os.path.basename(path) if path else "无路径"
                size_kb = (size or 0) / 1024
                print(f"   {i}. [{status}] {filename} ({size_kb:.1f}KB)")
                print(f"      URL: {url[:50]}...")

                # 检查文件是否真实存在
                if path and os.path.exists(path):
                    actual_size = os.path.getsize(path)
                    print(f"      ✅ 文件存在 (实际大小: {actual_size / 1024:.1f}KB)")
                else:
                    print("      ❌ 文件不存在")

            # 检查重复URL
            cursor = await conn.execute("""
                SELECT image_url, COUNT(*) as count
                FROM download_history
                GROUP BY image_url
                HAVING count > 1
                ORDER BY count DESC
                LIMIT 5
            """)
            duplicate_records = await cursor.fetchall()
            if duplicate_records:
                print("\n⚠️ 重复下载的URL (前5个):")
                for url, count in duplicate_records:
                    print(f"   - {count}次: {url[:50]}...")
            else:
                print("\n✅ 没有发现重复下载")

    except Exception as e:
        print(f"❌ 检查数据库时出错: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(check_download_status())
