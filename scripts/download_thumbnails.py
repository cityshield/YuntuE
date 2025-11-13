#!/usr/bin/env python3
"""
下载高质量的场景图片作为缩略图
尺寸：192x108 (16:9 比例)
使用 Lorem Picsum 作为图片源
"""

import os
import sys
import time
import requests
from PIL import Image
from io import BytesIO

# 目标尺寸
TARGET_WIDTH = 192
TARGET_HEIGHT = 108

# 输出目录
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'public', 'thumbnails')

# 确保输出目录存在
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 使用 Lorem Picsum API 的不同图片ID
# 使用 100-200 范围内的ID，这些都是高质量的风景和建筑照片
IMAGE_IDS = [
    0, 10, 20, 28, 48, 58, 60, 62, 63, 64,
    65, 66, 67, 70, 74, 77, 78, 82, 83, 84,
    88, 91, 96, 100, 102, 103, 104, 106, 109, 110,
    111, 112, 113, 116, 119, 120, 121, 122, 123, 124
]

def download_image(image_id, filename):
    """从 Lorem Picsum 下载图片"""
    try:
        print(f"📥 正在下载: {filename} (ID: {image_id})")
        # 直接请求指定尺寸的图片
        url = f"https://picsum.photos/id/{image_id}/400/225"
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        return Image.open(BytesIO(response.content))
    except Exception as e:
        print(f"❌ 下载失败 {filename}: {e}")
        return None

def resize_and_crop(image, target_width, target_height):
    """裁剪并调整图片到目标尺寸，保持比例"""
    # 计算目标比例
    target_ratio = target_width / target_height

    # 获取原始尺寸
    original_width, original_height = image.size
    original_ratio = original_width / original_height

    # 根据比例裁剪
    if original_ratio > target_ratio:
        # 原图更宽，裁剪宽度
        new_height = original_height
        new_width = int(original_height * target_ratio)
        left = (original_width - new_width) // 2
        top = 0
        right = left + new_width
        bottom = original_height
    else:
        # 原图更高，裁剪高度
        new_width = original_width
        new_height = int(original_width / target_ratio)
        left = 0
        top = (original_height - new_height) // 2
        right = original_width
        bottom = top + new_height

    # 裁剪
    cropped = image.crop((left, top, right, bottom))

    # 调整大小
    resized = cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)

    return resized

def download_all_thumbnails(count=40):
    """下载所有缩略图"""
    print(f"🎬 开始下载 {count} 张缩略图...")
    print(f"📁 输出目录: {OUTPUT_DIR}\n")

    success_count = 0

    for i in range(count):
        image_id = IMAGE_IDS[i % len(IMAGE_IDS)]
        filename = f"thumbnail_{i+1:02d}.jpg"
        filepath = os.path.join(OUTPUT_DIR, filename)

        # 跳过已存在的文件
        if os.path.exists(filepath):
            print(f"⏭️  跳过已存在: {filename}")
            success_count += 1
            continue

        # 下载图片
        image = download_image(image_id, filename)

        if image:
            try:
                # 调整大小
                resized = resize_and_crop(image, TARGET_WIDTH, TARGET_HEIGHT)

                # 保存
                resized.save(filepath, 'JPEG', quality=85, optimize=True)
                print(f"✅ 成功保存: {filename} ({TARGET_WIDTH}x{TARGET_HEIGHT})")
                success_count += 1

            except Exception as e:
                print(f"❌ 处理失败 {filename}: {e}")

        # 避免请求过快
        time.sleep(0.5)

    print(f"\n🎉 完成！成功下载 {success_count}/{count} 张缩略图")
    return success_count

if __name__ == '__main__':
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    download_all_thumbnails(count)
