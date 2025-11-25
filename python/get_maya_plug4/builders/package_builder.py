#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
打包工具模块
包含文件转换、打包和upload.json生成相关的工具函数
"""

import os
import json
import zipfile
import tempfile
import hashlib
from typing import Optional, Dict, Any, Set

from utils.path_utils import normalize_path_separators
from parsers.file_path_extractor import collect_existing_absolute_paths
# 导入全局logger
from core.logger import logger
from parsers.xgen_parser import collect_xgen_dependencies
import xxhash


def to_server_path(local_path: str, server_root: str) -> str:
    """将本地路径转换为服务器路径
    
    当server_root为空时，使用简洁格式：/C/Project/...
    当server_root非空时，使用完整格式：/input/LOCAL/xxx/cfg/C/Project/...
    """
    # 规范化路径：统一为正斜杠，去除所有双斜杠和多斜杠
    normalized_path = normalize_path_separators(local_path)
    # 盘符 C:/ → /C/
    if len(normalized_path) >= 2 and normalized_path[1] == ':' and normalized_path[0].isalpha():
        normalized_path = '/' + normalized_path[0].upper() + normalized_path[2:]
    
    # 如果server_root为空，直接返回简洁路径
    if not server_root or server_root.strip() == '':
        return normalized_path
    
    # 否则添加server_root前缀
    if not server_root.endswith('/'):
        server_root = server_root + '/'
    return server_root + normalized_path.lstrip('/')


def normalize_path(path: str, workspace: str) -> Optional[str]:
    """规范化路径：统一为正斜杠，去除所有双斜杠和多斜杠"""
    if not path:
        return None
    expanded_path = os.path.expandvars(path)
    
    if os.path.isabs(expanded_path):
        normalized = os.path.normpath(expanded_path)
        return normalize_path_separators(normalized)
    else:
        joined_path = os.path.normpath(os.path.join(workspace, expanded_path))
        normalized = normalize_path_separators(joined_path)
        return normalized if os.path.exists(normalized) else None


def create_upload_package(scene_path: str, upload_json_path: str, server_root: str, 
                         output_zip: str, render_settings_path: Optional[str] = None) -> None:
    """创建上传包（zip文件）
    
    Args:
        scene_path: 场景文件路径（MA文件，可能是转换后的，也可能是用户输入的）
        upload_json_path: upload.json文件路径
        server_root: 服务器根路径
        output_zip: 输出zip文件路径
        render_settings_path: render_settings.json文件路径（可选）
    """
    # 1. 读取upload.json
    with open(upload_json_path, 'r', encoding='utf-8') as f:
        upload_data = json.load(f)
    
    asset_count = len(upload_data.get('asset', []))
    scene_count = len(upload_data.get('scene', []))
    
    # 2. 确定要打包的场景文件路径（优先使用upload.json中的local路径）
    scene_item = upload_data.get('scene', [{}])[0] if upload_data.get('scene') else {}
    scene_local_path = scene_item.get('local')
    
    # 优先使用upload.json中的local路径，如果不存在或文件不存在，再使用传入的scene_path
    scene_file_to_package = None
    if scene_local_path and os.path.exists(scene_local_path):
        scene_file_to_package = scene_local_path
    elif scene_path and os.path.exists(scene_path):
        scene_file_to_package = scene_path
    elif scene_local_path:
        scene_file_to_package = scene_local_path
    else:
        scene_file_to_package = scene_path
    
    # 3. 创建临时upload.json文件（使用更新后的数据）
    temp_upload_json = tempfile.NamedTemporaryFile(mode='w', suffix='.json', 
                                                   delete=False, encoding='utf-8')
    json.dump(upload_data, temp_upload_json, ensure_ascii=False, indent=4)
    temp_upload_json.close()
    
    # 4. 创建zip文件
    os.makedirs(os.path.dirname(os.path.abspath(output_zip)), exist_ok=True)
    
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        # 添加upload.json到zip根目录
        zf.write(temp_upload_json.name, 'upload.json')
        
        # 添加render_settings.json到zip根目录（如果提供）
        if render_settings_path and os.path.exists(render_settings_path):
            zf.write(render_settings_path, 'render_settings.json')
        
        # 添加场景文件（使用转换后的MA文件）
        server_path = scene_item.get('server')
        
        if not server_path:
            if scene_local_path:
                server_path = to_server_path(scene_local_path, server_root)
            else:
                server_path = to_server_path(scene_file_to_package, server_root)
        
        # 确保场景文件被添加
        if scene_file_to_package and os.path.exists(scene_file_to_package):
            zip_path = server_path.lstrip('/')
            zf.write(scene_file_to_package, zip_path)
        
        # 添加所有asset文件
        total_files = len(upload_data.get('asset', []))
        if total_files > 0:
            success_count = 0
            fail_count = 0
            added_to_zip = set()  # 记录已添加到zip的文件路径，避免重复
            
            # 获取场景文件的basename（用于过滤用户原有的.xgen文件）
            scene_basename_with_timestamp = None
            if upload_data.get('scene'):
                scene_local_path = upload_data['scene'][0].get('local')
                if scene_local_path:
                    scene_basename_with_timestamp = os.path.splitext(os.path.basename(scene_local_path))[0]
            
            for idx, asset_item in enumerate(upload_data.get('asset', []), 1):
                local_path = asset_item['local']
                server_path = asset_item['server']
                
                # 跳过MA文件（场景文件，只在scene列表中）
                if local_path.lower().endswith('.ma'):
                    continue
                # 过滤.xgen文件：只保留以场景文件名开头的.xgen文件
                # 如果用户输入MB文件，场景文件名包含时间戳，则只包含Maya自动生成的.xgen文件
                # 如果用户输入MA文件，场景文件名不包含时间戳，则包含用户原有的.xgen文件
                if local_path.lower().endswith('.xgen') and scene_basename_with_timestamp:
                    xgen_basename = os.path.splitext(os.path.basename(local_path))[0]
                    # 如果.xgen文件名不是以场景文件名开头，跳过
                    if not xgen_basename.startswith(scene_basename_with_timestamp):
                        continue
                
                # 在zip中使用server路径（去掉开头的/）
                zip_path = server_path.lstrip('/')
                
                # 检查是否已经添加到zip（避免重复）
                if zip_path in added_to_zip:
                    continue
                
                if os.path.exists(local_path):
                    try:
                        zf.write(local_path, zip_path)
                        added_to_zip.add(zip_path)
                        success_count += 1
                    except Exception as e:
                        fail_count += 1
                else:
                    fail_count += 1
            
    # 清理临时文件
    try:
        os.unlink(temp_upload_json.name)
    except:
        pass


def expand_external_files(scene_path: str, mayapy_json: Dict[str, Any]) -> Dict[str, Any]:
    """扩展外部文件
    
    Args:
        scene_path: 场景文件路径
        mayapy_json: Maya场景数据
    """
    scene_dir = os.path.dirname(os.path.abspath(scene_path))
    mb_workspace = (mayapy_json.get('project') or {}).get('workspace')
    
    project_root = scene_dir
    if os.path.basename(scene_dir).lower() == 'scenes':
        project_root = os.path.dirname(scene_dir)
    
    if mb_workspace and 'maya/projects/default' in normalize_path_separators(mb_workspace).lower():
        workspace = project_root
    else:
        workspace = mb_workspace or project_root
    
    external_file_categories = mayapy_json.get('external_files') or {}
    collected: Set[str] = set()
    categorized: Dict[str, Set[str]] = {key: set(value if isinstance(value, list) else []) for key, value in external_file_categories.items() if not isinstance(value, dict)}
    
    def add_file_path(file_path: str, category: str = 'others'):
        if not file_path:
            return
        normalized_file_path = normalize_path(file_path, workspace)
        if normalized_file_path and os.path.exists(normalized_file_path):
            collected.add(normalized_file_path)
            categorized.setdefault(category, set()).add(normalized_file_path)
    
    def add_directory_recursive(directory_path: str, category: str = 'others'):
        """递归添加目录中的所有文件"""
        if not directory_path or not os.path.exists(directory_path):
            return
        
        try:
            for root, dirs, files in os.walk(directory_path):
                for file_name in files:
                    file_path = normalize_path_separators(os.path.join(root, file_name))
                    collected.add(file_path)
                    categorized.setdefault(category, set()).add(file_path)
        except Exception as e:
            logger.warning(f"递归收集目录失败: {directory_path}, 错误: {e}")
    
    for category, file_list in external_file_categories.items():
        # xgen_data_dirs是目录列表，不应该直接添加，而是用于后续递归收集
        if category == 'xgen_data_dirs':
            continue
        
        if isinstance(file_list, list):
            for file_path in file_list:
                add_file_path(file_path, category)
        elif isinstance(file_list, dict):
            for _, sub_list in file_list.items():
                for file_path in sub_list or []:
                    add_file_path(file_path, category)
    
    for file_path in mayapy_json.get('file_textures') or []:
        add_file_path(file_path, 'textures')
    for file_path in mayapy_json.get('references') or []:
        add_file_path(file_path, 'references')
    
    # 收集色彩管理文件（OCIO配置文件及LUT等）
    color_mgmt_files = external_file_categories.get('color_management', [])
    if color_mgmt_files:
        logger.print_with_time(f"    正在收集色彩管理文件...")
        for file_path in color_mgmt_files:
            add_file_path(file_path, 'color_management')
        logger.print_with_time(f"      收集了 {len(color_mgmt_files)} 个OCIO配置/LUT文件")
    
    # 智能收集 XGen 依赖文件（优先使用 Maya API 收集的详细文件）
    xgen_files = external_file_categories.get('xgen', [])
    xgen_data_dirs = external_file_categories.get('xgen_data_dirs', [])
    xgen_detailed_files = external_file_categories.get('xgen_detailed_files', [])  # 从 Maya API 收集的详细文件
    
    if xgen_files:
        logger.print_with_time(f"    正在收集XGen文件...")
        logger.print_with_time(f"      发现 {len(xgen_files)} 个.xgen文件")
        
        # 优先使用 Maya API 收集的详细文件（最准确）
        if xgen_detailed_files:
            detailed_count = 0
            for detail_file in xgen_detailed_files:
                detail_abs = normalize_path(detail_file, workspace)
                if detail_abs and os.path.exists(detail_abs):
                    collected.add(detail_abs)
                    categorized.setdefault('xgen_data', set()).add(detail_abs)
                    detailed_count += 1
            logger.print_with_time(f"      从Maya API收集: {detailed_count} 个文件")
        
        # 如果有数据目录，使用解析器或递归收集
        if xgen_data_dirs:
            logger.print_with_time(f"      解析.xgen文件获取额外依赖...")
            
            xgen_parsed_count = 0
            for xgen_file in xgen_files:
                xgen_file_abs = normalize_path(xgen_file, workspace)
                if not xgen_file_abs or not os.path.exists(xgen_file_abs):
                    continue
                
                # 找到对应的 xgen 数据目录
                for xgen_data_dir in xgen_data_dirs:
                    xgen_dir_abs = normalize_path(xgen_data_dir, workspace)
                    if not xgen_dir_abs or not os.path.exists(xgen_dir_abs):
                        continue
                    
                    # 解析 XGen 文件，获取依赖列表
                    dependencies = collect_xgen_dependencies(xgen_file_abs, xgen_dir_abs)
                    
                    if dependencies:
                        xgen_parsed_count += len(dependencies)
                        for dep_file in dependencies:
                            collected.add(dep_file)
                            categorized.setdefault('xgen_data', set()).add(dep_file)
                    else:
                        # 如果解析失败，回退到递归收集整个目录
                        add_directory_recursive(xgen_dir_abs, 'xgen_data')
                    
                    break  # 找到匹配的目录后退出
            
            if xgen_parsed_count > 0:
                logger.print_with_time(f"      从.xgen解析收集: {xgen_parsed_count} 个文件")
        
        logger.print_with_time(f"      XGen收集完成")
    
    all_files = sorted(list(collected))
    by_type = {key: sorted(list(value)) for key, value in categorized.items()}
    
    return {
        'all_files': all_files,
        'by_type': by_type
    }


def build_upload_mapping(scene_path: str, server_root: str) -> Dict[str, Any]:
    """构建场景文件的上传映射（直接从MA文件读取）
    
    Args:
        scene_path: 场景文件路径（MA文件）
        server_root: 服务器根路径
    """
    # 确保是MA文件
    if not scene_path.lower().endswith('.ma'):
        logger.error(f"不是MA文件: {scene_path}")
        return {'asset': [], 'scene': []}
    
    # 使用scene_path的目录作为相对路径拼接的基准
    scene_dir = os.path.dirname(os.path.abspath(scene_path))
    
    # 从MA文件中提取所有存在的文件（包括绝对路径和相对路径）
    existing_files = collect_existing_absolute_paths(scene_path, scene_dir)
    
    logger.print_with_time("  [2/3] 构建asset映射...")
    
    asset = []
    added_paths = set()  # 用于去重，记录已添加的local路径
    
    # 确定场景文件在upload.json中的路径（直接使用scene_path，因为已经是转换后的MA文件）
    scene_local = normalize_path_separators(os.path.abspath(scene_path))
    scene_basename_with_timestamp = os.path.splitext(os.path.basename(scene_path))[0]
    
    # 注意：场景文件不添加到asset列表，只在scene列表中
    # 添加其他文件（去重）
    for file_path in existing_files:
        normalized_path = normalize_path_separators(file_path)
        # 跳过场景文件（MA文件，只在scene列表中）
        if normalized_path == scene_local:
            continue
        # 跳过MA文件（场景文件，只在scene列表中）
        if normalized_path.lower().endswith('.ma'):
            continue
        # 过滤.xgen文件：只保留以场景文件名开头的.xgen文件
        # 如果用户输入MB文件，场景文件名包含时间戳，则只包含Maya自动生成的.xgen文件
        # 如果用户输入MA文件，场景文件名不包含时间戳，则包含用户原有的.xgen文件
        if normalized_path.lower().endswith('.xgen'):
            xgen_basename = os.path.splitext(os.path.basename(normalized_path))[0]
            # 如果.xgen文件名不是以场景文件名开头，跳过
            if not xgen_basename.startswith(scene_basename_with_timestamp):
                continue
        # 去重：如果路径已存在，跳过
        if normalized_path not in added_paths:
            asset.append({
                'local': normalized_path,
                'server': to_server_path(file_path, server_root)
            })
            added_paths.add(normalized_path)
    
    logger.print_with_time("  [3/3] 计算场景文件hash...")
    
    scene_hash = ''
    xxhash_value = ''
    # 使用实际的scene_path文件计算hash（可能是临时文件）
    try:
        with open(scene_path, 'rb') as f:
            content = f.read()
            scene_hash = hashlib.md5(content).hexdigest()
            
            # 使用xxhash库计算hash
            xxhash_value = str(xxhash.xxh64(content).intdigest())
    except Exception as e:
        logger.warning(f"无法计算场景文件hash: {e}")
        scene_hash = '0' * 32
        xxhash_value = '0'
    
    # scene字段顺序与test/upload.json保持一致：hash, local, server, xxhash
    # 注意：local和server路径使用scene_local（原始MB目录下的路径），而不是临时文件路径
    scene = [{
        'hash': scene_hash,
        'local': scene_local,
        'server': to_server_path(scene_local, server_root),
        'xxhash': xxhash_value
    }]
    
    return {
        'asset': asset,
        'scene': scene
    }


def save_upload_json(obj: Dict[str, Any], out_path: str) -> None:
    """保存upload.json文件"""
    out_dir = os.path.dirname(os.path.abspath(out_path))
    if out_dir:  # 如果路径包含目录部分
        os.makedirs(out_dir, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)



