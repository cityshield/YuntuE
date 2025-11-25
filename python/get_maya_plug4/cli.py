#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
get_maya_plug4 CLI 包装

按照 main.py 的方式调用 MayaSceneProcessor(scene_path, output_dir, server_root)，
并在 stdout 输出 JSON，包含 zip/upload.json/render_settings.json 的路径与依赖统计。
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from typing import Any, Dict, Optional

from core.processor import MayaSceneProcessor
from core.logger import Logger, LogLevel


TEXTURE_EXTS = {
    '.jpg', '.jpeg', '.png', '.tga', '.tif', '.tiff', '.bmp', '.psd', '.iff', '.sgi',
    '.exr', '.hdr', '.tx', '.dds', '.gif', '.dpx', '.rat'
}
CACHE_EXTS = {
    '.abc', '.usd', '.usdz', '.vdb', '.bgeo', '.mcx', '.mc', '.ass', '.cache', '.xml',
    '.pdc', '.ptc', '.bif', '.sim', '.xpd'
}
REFERENCE_EXTS = {
    '.ma', '.mb', '.fbx', '.obj', '.gltf', '.glb'
}
XGEN_EXTS = {
    '.xgen', '.xgip', '.xgr', '.xuv'
}


def _print_json(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


def _categorize_dependency(path: str) -> str:
    lower = path.lower()
    ext = os.path.splitext(lower)[1]

    if ext in TEXTURE_EXTS:
        return 'texture'
    if ext in CACHE_EXTS or 'cache' in lower:
        return 'cache'
    if ext in XGEN_EXTS or 'xgen' in lower:
        return 'xgen'
    if ext in REFERENCE_EXTS or 'reference' in lower:
        return 'reference'
    return 'other'


def _compute_dependency_stats(upload_json_path: Optional[str]) -> Dict[str, Any]:
    stats = {
        'texture_count': 0,
        'texture_size': 0,
        'cache_count': 0,
        'cache_size': 0,
        'reference_count': 0,
        'reference_size': 0,
        'xgen_count': 0,
        'xgen_size': 0,
        'other_count': 0,
        'other_size': 0,
        'total_files': 0,
        'total_size': 0,
    }

    if not upload_json_path or not os.path.exists(upload_json_path):
        return stats

    try:
        with open(upload_json_path, 'r', encoding='utf-8') as fp:
            data = json.load(fp)
    except Exception:
        return stats

    assets = data.get('asset') or data.get('assets') or []

    for item in assets:
        local_path = item.get('local')
        if not local_path:
            continue

        category = _categorize_dependency(local_path)
        size = 0
        try:
            if os.path.exists(local_path):
                size = os.path.getsize(local_path)
        except OSError:
            size = 0

        stats[f'{category}_count'] += 1
        stats[f'{category}_size'] += size
        stats['total_files'] += 1
        stats['total_size'] += size

    return stats


def _ensure_parent_dir(path: Optional[str]) -> None:
    if not path:
        return
    directory = os.path.dirname(os.path.abspath(path))
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)


def cmd_package(args: argparse.Namespace) -> int:
    scene = args.scene
    if not os.path.exists(scene):
        _print_json({'error': f'scene not found: {scene}'})
        return 2

    output_dir = args.output_dir or os.path.dirname(os.path.abspath(scene))
    server_root = args.server_root or ''
    out_zip = args.out_zip
    maya_bin = args.maya_bin
    log_file = args.log_file

    os.makedirs(output_dir, exist_ok=True)
    _ensure_parent_dir(out_zip)
    _ensure_parent_dir(log_file)

    logger = Logger(
        log_file=log_file,
        console_output=not log_file,
        file_output=bool(log_file),
        log_level=LogLevel.INFO,
        append_mode=False,
    )

    if maya_bin:
        # 记录兼容性提示，避免用户误以为参数生效
        logger.warning("get_maya_plug4 将自动探测 Maya，当前版本忽略 --maya-bin 参数")

    processor = MayaSceneProcessor(
        scene_path=scene,
        output_dir=output_dir,
        server_root=server_root,
        logger=logger,
    )

    try:
        processor.process()
    except Exception as exc:
        _print_json({'error': str(exc)})
        return 2

    generated_zip = processor.zip_path
    if not generated_zip or not os.path.exists(generated_zip):
        _print_json({'error': '打包失败，未生成 zip 文件'})
        return 2

    final_zip = out_zip or generated_zip
    if os.path.abspath(final_zip) != os.path.abspath(generated_zip):
        try:
            shutil.copy2(generated_zip, final_zip)
        except Exception as exc:
            _print_json({'error': f'写入目标 zip 失败: {exc}'})
            return 2

    upload_json_path = processor.upload_path
    render_settings_path = processor.render_json_path

    if not upload_json_path or not os.path.exists(upload_json_path):
        _print_json({'error': 'upload.json 缺失'})
        return 2
    if not render_settings_path or not os.path.exists(render_settings_path):
        _print_json({'error': 'render_settings.json 缺失'})
        return 2

    stats = _compute_dependency_stats(upload_json_path)

    result = {
        'success': True,
        'zip': final_zip,
        'zip_name': os.path.basename(final_zip),
        'upload_json': upload_json_path,
        'render_settings': render_settings_path,
        'server_root': server_root,
        'stats': stats,
    }

    if log_file:
        result['log_file'] = log_file

    _print_json(result)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog='get_maya_plug4',
        description='YuntuE Maya packaging CLI (get_maya_plug4)',
    )
    sub = parser.add_subparsers(dest='command', required=True)

    package_parser = sub.add_parser('package', help='生成 upload.json/render_settings.json 及 zip')
    package_parser.add_argument('--scene', required=True, help='.ma 或 .mb 场景文件路径')
    package_parser.add_argument('--output-dir', required=False, help='输出目录，缺省为场景所在目录')
    package_parser.add_argument('--server-root', required=False, default='', help='服务器根路径，例如 /input/LOCAL/<job>/cfg')
    package_parser.add_argument('--out-zip', required=False, help='zip 输出路径（可选）')
    package_parser.add_argument('--maya-bin', required=False, help='兼容参数：目前版本会自动探测 Maya，无需手动设置')
    package_parser.add_argument('--log-file', required=False, help='日志输出文件（可选）')
    package_parser.set_defaults(func=cmd_package)

    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == '__main__':
    sys.exit(main())
