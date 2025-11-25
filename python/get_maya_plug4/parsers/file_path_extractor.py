#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MA文件解析模块
直接从MA文件中提取文件路径引用
"""

import os
import re
import platform
from typing import List, Set
from utils.path_utils import normalize_path_separators
# 导入全局logger
from core.logger import logger
from parsers.xgen_parser import collect_xgen_dependencies


def is_absolute_path(path: str) -> bool:
    """
    判断路径是否为绝对路径（根据当前操作系统）
    
    使用Python标准库的os.path.isabs()，它会自动根据操作系统判断：
    - Windows: 检查是否以盘符（如C:）开头
    - Linux/Unix: 检查是否以根目录（/）开头
    
    这是最可靠的方法，因为：
    1. 标准库实现，经过充分测试
    2. 自动适配当前操作系统
    3. 处理各种边界情况（如UNC路径等）
    """
    if not path:
        return False
    # 使用os.path.isabs()，它会根据当前操作系统自动判断
    # Windows: 检查 C: 或 UNC路径（\\server\share）
    # Linux: 检查是否以 / 开头
    return os.path.isabs(path)


def _extract_file_texture_paths(content: str, file_paths: Set[str]) -> None:
    """提取file节点的纹理路径"""
    pattern = r'setAttr\s+"\.fileTextureName"\s+-type\s+"string"\s+"([^"]+)"'
    for match in re.finditer(pattern, content):
        path = match.group(1).strip()
        if path:
            file_paths.add(path)


def _extract_reference_paths(content: str, file_paths: Set[str]) -> None:
    """提取引用文件路径"""
    pattern = r'file\s+-r[^"]*"\s*"([^"]+)"'
    for match in re.finditer(pattern, content):
        path = match.group(1).strip()
        if path:
            file_paths.add(path)


def _extract_alembic_paths(content: str, file_paths: Set[str]) -> None:
    """提取Alembic文件路径"""
    pattern = r'setAttr\s+"\.abc_File"\s+-type\s+"string"\s+"([^"]+)"'
    for match in re.finditer(pattern, content):
        path = match.group(1).strip()
        if path:
            file_paths.add(path)


def _extract_usd_paths(content: str, file_paths: Set[str]) -> None:
    """提取USD文件路径"""
    pattern = r'setAttr\s+"\.filePath"\s+-type\s+"string"\s+"([^"]+)"'
    for match in re.finditer(pattern, content):
        path = match.group(1).strip()
        if path:
            file_paths.add(path)


def _extract_gpu_cache_paths(content: str, file_paths: Set[str]) -> None:
    """提取GPU Cache文件路径"""
    pattern = r'setAttr\s+"\.cacheFileName"\s+-type\s+"string"\s+"([^"]+)"'
    for match in re.finditer(pattern, content):
        path = match.group(1).strip()
        if path:
            file_paths.add(path)


def _extract_arnold_standin_paths(content: str, file_paths: Set[str]) -> None:
    """提取Arnold Stand-In文件路径"""
    pattern = r'setAttr\s+"\.dso"\s+-type\s+"string"\s+"([^"]+)"'
    for match in re.finditer(pattern, content):
        path = match.group(1).strip()
        if path:
            file_paths.add(path)


def _extract_arnold_image_paths(content: str, file_paths: Set[str]) -> None:
    """提取Arnold Image文件路径"""
    pattern = r'setAttr\s+"\.filename"\s+-type\s+"string"\s+"([^"]+)"'
    for match in re.finditer(pattern, content):
        path = match.group(1).strip()
        if path:
            file_paths.add(path)


def _extract_cache_file_paths(content: str, file_paths: Set[str]) -> None:
    """提取Cache File路径"""
    # 匹配cacheFile节点的cachePath和cacheName，组合成完整路径
    cache_file_pattern = r'createNode\s+cacheFile[^;]*;.*?setAttr\s+"\.cachePath"\s+-type\s+"string"\s+"([^"]+)"[^;]*;.*?setAttr\s+"\.cacheName"\s+-type\s+"string"\s+"([^"]+)"'
    for match in re.finditer(cache_file_pattern, content, re.DOTALL):
        cache_path = match.group(1).strip()
        cache_name = match.group(2).strip()
        if cache_path and cache_name:
            full_path = os.path.join(cache_path, cache_name + ".xml")
            file_paths.add(full_path)
    
    # 也单独提取cachePath（如果没有cacheName）
    pattern_cache_path = r'setAttr\s+"\.cachePath"\s+-type\s+"string"\s+"([^"]+)"'
    for match in re.finditer(pattern_cache_path, content):
        start_pos = match.start()
        prev_text = content[max(0, start_pos-500):start_pos]
        if 'createNode cacheFile' in prev_text:
            path = match.group(1).strip()
            if path:
                file_paths.add(path)


def _extract_disk_cache_paths(content: str, file_paths: Set[str]) -> None:
    """提取Disk Cache文件路径"""
    pattern = r'setAttr\s+"\.cacheName"\s+-type\s+"string"\s+"([^"]+\.(?:dc|diskCache))'
    for match in re.finditer(pattern, content, re.IGNORECASE):
        path = match.group(1).strip()
        if path:
            file_paths.add(path)


def _extract_mash_audio_paths(content: str, file_paths: Set[str]) -> None:
    """提取MASH Audio文件路径"""
    pattern = r'setAttr\s+"\.filename"\s+-type\s+"string"\s+"([^"]+\.(?:wav|mp3|aac|ogg|flac))'
    for match in re.finditer(pattern, content, re.IGNORECASE):
        path = match.group(1).strip()
        if path:
            file_paths.add(path)


def _extract_particle_cache_paths(content: str, file_paths: Set[str]) -> None:
    """提取Particle Cache文件路径"""
    pattern = r'setAttr\s+"\.cachePath"\s+-type\s+"string"\s+"([^"]+)"'
    for match in re.finditer(pattern, content):
        path = match.group(1).strip()
        if path:
            file_paths.add(path)


def _extract_ocio_paths(content: str, file_paths: Set[str]) -> None:
    """提取OCIO配置文件路径"""
    pattern = r'setAttr\s+"\.(?:colorManagementPrefs|ocioConfig)"\s+-type\s+"string"\s+"([^"]+)"'
    for match in re.finditer(pattern, content):
        path = match.group(1).strip()
        if path:
            file_paths.add(path)


def _extract_general_paths(content: str, file_paths: Set[str]) -> None:
    """提取其他可能的文件路径（通用模式）"""
    if platform.system() == 'Windows':
        pattern = r'"([A-Za-z]:[^"]+)"'
    else:
        pattern = r'"(/[^"]+)"'
    
    for match in re.finditer(pattern, content):
        path = match.group(1).strip()
        if path and ('/' in path or '\\' in path):
            if not path.startswith('.') and len(path) > 3:
                file_paths.add(path)


def extract_file_paths_from_ma(ma_file_path: str) -> Set[str]:
    """
    从MA文件中提取所有文件路径引用
    
    Args:
        ma_file_path: MA文件路径
        
    Returns:
        文件路径集合（去重后的路径）
    """
    if not os.path.exists(ma_file_path):
        return set()
    
    if not ma_file_path.lower().endswith('.ma'):
        return set()
    
    file_paths = set()
    
    try:
        with open(ma_file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        _extract_file_texture_paths(content, file_paths)
        _extract_reference_paths(content, file_paths)
        _extract_alembic_paths(content, file_paths)
        _extract_usd_paths(content, file_paths)
        _extract_gpu_cache_paths(content, file_paths)
        _extract_arnold_standin_paths(content, file_paths)
        _extract_arnold_image_paths(content, file_paths)
        _extract_cache_file_paths(content, file_paths)
        _extract_disk_cache_paths(content, file_paths)
        _extract_mash_audio_paths(content, file_paths)
        _extract_particle_cache_paths(content, file_paths)
        _extract_ocio_paths(content, file_paths)
        _extract_general_paths(content, file_paths)
        
    except Exception as e:
        logger.warning(f"解析MA文件失败: {ma_file_path}, 错误: {e}")
    
    return file_paths


def _extract_absolute_paths_from_xgen(xgen_file_path: str) -> Set[str]:
    """
    从.xgen文件中提取所有绝对路径（仅文件路径，不包括目录）
    
    Args:
        xgen_file_path: .xgen文件路径
        
    Returns:
        绝对路径集合（仅文件路径）
    """
    absolute_paths = set()
    
    if not os.path.exists(xgen_file_path):
        return absolute_paths
    
    try:
        with open(xgen_file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        # 提取所有可能的绝对路径
        # Windows: 匹配 C:/ 或 C:\ 开头的路径
        # Linux: 匹配 / 开头的路径
        if platform.system() == 'Windows':
            # Windows: 匹配盘符开头的路径
            pattern = r'([A-Za-z]:[/\\][^\s"\'<>|]+)'
        else:
            # Linux: 匹配 / 开头的路径
            pattern = r'(/[^\s"\'<>|]+)'
        
        for match in re.finditer(pattern, content):
            path = match.group(1).strip()
            # 验证是否为有效的绝对路径
            if is_absolute_path(path):
                # 进一步验证：路径应该包含至少一个斜杠，且长度合理
                if ('/' in path or '\\' in path) and len(path) > 2:
                    # 规范化路径
                    normalized_path = normalize_path_separators(path)
                    # 只添加文件路径，不添加目录路径
                    # 检查路径是否存在且是文件
                    if os.path.exists(normalized_path) and os.path.isfile(normalized_path):
                        absolute_paths.add(normalized_path)
    
    except Exception as e:
        logger.warning(f"从XGen文件提取路径失败: {xgen_file_path}, 错误: {e}")
    
    return absolute_paths


def _collect_directory_files(directory_path: str, file_list: List[str], extensions: tuple = None) -> int:
    """
    递归收集目录中的所有文件
    
    Args:
        directory_path: 目录路径
        file_list: 文件列表（会直接修改此列表）
        extensions: 要收集的文件扩展名元组（如果为None则收集所有文件）
        
    Returns:
        收集到的文件数量
    """
    count = 0
    try:
        for root, dirs, files in os.walk(directory_path):
            # 跳过一些明显的临时/备份目录
            dirs[:] = [d for d in dirs if d.lower() not in ['backup', 'temp', 'cache', '.git']]
            
            for file in files:
                file_path = os.path.join(root, file)
                if os.path.isfile(file_path):
                    # 如果指定了扩展名过滤，只收集匹配的文件
                    if extensions is None:
                        # 没有扩展名过滤，收集所有文件
                        if file_path not in file_list:
                            file_list.append(file_path)
                            count += 1
                    else:
                        # 有扩展名过滤，检查文件扩展名
                        file_lower = file.lower()
                        if any(file_lower.endswith(ext) for ext in extensions):
                            if file_path not in file_list:
                                file_list.append(file_path)
                                count += 1
    except Exception as e:
        logger.warning(f"收集目录文件失败: {directory_path}, 错误: {e}")
    return count


def _get_ocio_extensions() -> tuple:
    """获取OCIO相关文件扩展名"""
    return ('.lut', '.spi1d', '.spi3d', '.cube', '.3dl', 
            '.csp', '.ctf', '.clf', '.cc', '.ccc', '.cdl',
            '.mga', '.m3d', '.ocio', '.xml', '.yaml', '.yml')


def _process_absolute_path(path: str, existing_paths: List[str], verbose: bool = False) -> tuple:
    """
    处理单个绝对路径
    
    Returns:
        (是否添加了路径, 添加的文件数量)
    """
    if verbose:
        logger.print_with_time(f"      绝对路径: {path}")
    added_count = 0
    
    if os.path.exists(path):
        if os.path.isfile(path):
            normalized_path = normalize_path_separators(path)
            if normalized_path not in existing_paths:
                existing_paths.append(normalized_path)
                added_count += 1
                if verbose:
                    logger.print_with_time(f"            -> 文件存在，已添加到资源列表")
            
            # 注意：OCIO配置文件在_process_ocio_configs中统一处理，这里不再重复处理
        elif os.path.isdir(path):
            if verbose:
                logger.print_with_time(f"            -> 目录存在，递归收集目录中的文件...")
            dir_file_count = _collect_directory_files(path, existing_paths)
            added_count += dir_file_count
            if verbose:
                logger.print_with_time(f"            -> 从目录中收集了 {dir_file_count} 个文件")
    else:
        if verbose:
            logger.print_with_time(f"            -> 路径不存在，跳过")
    
    return added_count > 0, added_count


def _process_relative_path(path: str, ma_dir: str, existing_paths: List[str], verbose: bool = False) -> tuple:
    """
    处理单个相对路径
    
    Returns:
        (是否添加了路径, 添加的文件数量)
    """
    if verbose:
        logger.print_with_time(f"      相对路径: {path}")
    added_count = 0
    
    absolute_path = os.path.join(ma_dir, path)
    absolute_path = os.path.normpath(absolute_path)
    absolute_path = os.path.abspath(absolute_path)
    if verbose:
        logger.print_with_time(f"            -> 拼接后: {absolute_path}")
    
    if os.path.exists(absolute_path):
        if os.path.isfile(absolute_path):
            normalized_path = normalize_path_separators(absolute_path)
            if normalized_path not in existing_paths:
                existing_paths.append(normalized_path)
                added_count += 1
                if verbose:
                    logger.print_with_time(f"            -> 文件存在，已添加到资源列表")
        elif os.path.isdir(absolute_path):
            if verbose:
                logger.print_with_time(f"            -> 目录存在，递归收集目录中的文件...")
            dir_file_count = _collect_directory_files(absolute_path, existing_paths)
            added_count += dir_file_count
            if verbose:
                logger.print_with_time(f"            -> 从目录中收集了 {dir_file_count} 个文件")
    else:
        if verbose:
            logger.print_with_time(f"            -> 路径不存在，跳过")
    
    return added_count > 0, added_count


def _find_xgen_files(scene_path: str) -> List[str]:
    """查找.xgen文件，只查找以场景文件名开头的.xgen文件"""
    xgen_files = []
    
    if not scene_path:
        return xgen_files
    
    scene_dir = os.path.dirname(os.path.abspath(scene_path))
    scene_basename = os.path.splitext(os.path.basename(scene_path))[0]
    # 使用完整的场景文件名（可能包含时间戳）来匹配.xgen文件
    # 如果场景文件名包含时间戳（MB转MA的情况），则只匹配Maya自动生成的.xgen文件
    # 例如：wolf_fur_refV39_20241107180000.ma -> 匹配 wolf_fur_refV39_20241107180000__xxx.xgen
    # 如果场景文件名不包含时间戳（用户直接输入MA文件），则也会匹配用户原有的.xgen文件
    # 例如：wolf_fur_refV39.ma -> 匹配 wolf_fur_refV39__xxx.xgen（用户原有的）
    
    if os.path.exists(scene_dir):
        try:
            for file_name in os.listdir(scene_dir):
                # 只查找以完整场景文件名（可能包含时间戳）开头的.xgen文件
                if file_name.lower().endswith('.xgen') and file_name.startswith(scene_basename):
                    xgen_file_path = os.path.join(scene_dir, file_name)
                    if os.path.isfile(xgen_file_path):
                        xgen_files.append(xgen_file_path)
        except Exception as e:
            logger.warning(f"查找XGen文件失败: {e}")
    
    return xgen_files


def _process_ocio_configs(existing_paths: List[str]) -> None:
    """处理OCIO配置文件：递归收集配置目录下的所有相关文件"""
    ocio_config_files = [p for p in existing_paths if p.lower().endswith('.ocio')]
    if not ocio_config_files:
        return
    
    ocio_dir_count = 0
    ocio_extensions = set(_get_ocio_extensions())
    processed_dirs = set()  # 记录已处理的目录，避免重复处理
    
    for ocio_config in ocio_config_files:
        config_dir = os.path.dirname(ocio_config)
        normalized_config_dir = normalize_path_separators(config_dir)
        
        # 避免重复处理同一个目录
        if normalized_config_dir in processed_dirs:
            continue
        processed_dirs.add(normalized_config_dir)
        
        if os.path.exists(config_dir) and os.path.isdir(config_dir):
            try:
                for root, dirs, files in os.walk(config_dir):
                    for file in files:
                        file_lower = file.lower()
                        if any(file_lower.endswith(ext) for ext in ocio_extensions):
                            file_path = normalize_path_separators(os.path.join(root, file))
                            if file_path not in existing_paths and os.path.isfile(file_path):
                                existing_paths.append(file_path)
                                ocio_dir_count += 1
            except Exception as e:
                logger.warning(f"收集OCIO目录文件失败: {e}")


def _extract_xgen_data_dirs(ma_file_path: str, ma_dir: str) -> List[str]:
    """从MA文件中提取XGen数据目录路径"""
    xgen_data_dirs = set()
    
    # 方法1: 从MA文件中提取XGen数据目录路径（xgDataPath）
    try:
        with open(ma_file_path, 'r', encoding='utf-8', errors='ignore') as f:
            ma_content = f.read()
        pattern_xgen_data = r'setAttr\s+"\.xgDataPath"\s+-type\s+"string"\s+"([^"]+)"'
        for match in re.finditer(pattern_xgen_data, ma_content):
            data_path = match.group(1).strip()
            if data_path:
                if is_absolute_path(data_path):
                    if os.path.exists(data_path) and os.path.isdir(data_path):
                        xgen_data_dirs.add(data_path)
                else:
                    absolute_data_path = os.path.join(ma_dir, data_path)
                    absolute_data_path = os.path.normpath(absolute_data_path)
                    absolute_data_path = os.path.abspath(absolute_data_path)
                    if os.path.exists(absolute_data_path) and os.path.isdir(absolute_data_path):
                        xgen_data_dirs.add(absolute_data_path)
    except Exception as e:
        logger.warning(f"从MA文件提取XGen数据目录失败: {e}")
    
    # 方法2: 如果没有找到数据目录，尝试自动检测（基于项目结构）
    if not xgen_data_dirs:
        # 使用ma_dir来判断项目结构
        if os.path.basename(ma_dir).lower() == 'scenes':
            project_root = os.path.dirname(ma_dir)
            xgen_dir = os.path.join(project_root, 'xgen')
            if os.path.exists(xgen_dir) and os.path.isdir(xgen_dir):
                xgen_data_dirs.add(xgen_dir)
    
    return list(xgen_data_dirs)


def _process_single_xgen_file(xgen_file: str, xgen_data_dirs: List[str], existing_paths: List[str]) -> int:
    """处理单个XGen文件，返回添加的文件数量"""
    xgen_path_count = 0
    
    # 将.xgen文件本身添加到资源列表（如果还没有添加）
    normalized_xgen_file = normalize_path_separators(xgen_file)
    if normalized_xgen_file not in existing_paths:
        existing_paths.append(normalized_xgen_file)
    
    # 方法1: 从.xgen文件中提取所有绝对路径（仅文件路径，不包括目录）
    xgen_absolute_paths = _extract_absolute_paths_from_xgen(xgen_file)
    if xgen_absolute_paths:
        for xgen_path in xgen_absolute_paths:
            normalized_xgen_path = normalize_path_separators(xgen_path)
            if normalized_xgen_path not in existing_paths:
                existing_paths.append(normalized_xgen_path)
                xgen_path_count += 1
    
    # 方法2: 使用xgen_parser解析.xgen文件获取依赖（如果xgen数据目录存在）
    xgen_parsed_success = False
    if xgen_data_dirs:
        for xgen_data_dir in xgen_data_dirs:
            if os.path.exists(xgen_data_dir):
                dependencies = collect_xgen_dependencies(xgen_file, xgen_data_dir)
                if dependencies:
                    for dep_file in dependencies:
                        normalized_dep_file = normalize_path_separators(dep_file)
                        if normalized_dep_file not in existing_paths:
                            existing_paths.append(normalized_dep_file)
                            xgen_path_count += 1
                    xgen_parsed_success = True
                break
    
    if xgen_data_dirs and not xgen_parsed_success:
        logger.warning(
            f"未能解析XGen依赖: {xgen_file}，已跳过递归收集，避免引入无关文件"
        )
    
    return xgen_path_count


def _process_xgen_files(xgen_files: List[str], ma_file_path: str, ma_dir: str, 
                       existing_paths: List[str]) -> None:
    """处理找到的.xgen文件"""
    if not xgen_files:
        return
    
    xgen_data_dirs = _extract_xgen_data_dirs(ma_file_path, ma_dir)
    
    for xgen_file in xgen_files:
        _process_single_xgen_file(xgen_file, xgen_data_dirs, existing_paths)


def collect_existing_absolute_paths(ma_file_path: str, original_scene_dir: str = None) -> List[str]:
    """
    从MA文件中提取所有存在的文件路径（包括绝对路径和相对路径）
    
    Args:
        ma_file_path: MA文件路径
        original_scene_dir: 场景文件所在目录（用于相对路径拼接，如果为None则使用ma_file_path的目录）
        
    Returns:
        存在的文件路径列表（已转换为绝对路径）
    """
    all_paths = extract_file_paths_from_ma(ma_file_path)
    existing_paths = []
    
    # 获取用于拼接相对路径的目录
    if original_scene_dir:
        ma_dir = os.path.abspath(original_scene_dir)
    else:
        ma_dir = os.path.dirname(os.path.abspath(ma_file_path))
    
    # 统计信息
    absolute_count = 0
    relative_count = 0
    existing_absolute_count = 0
    existing_relative_count = 0
    
    # 处理所有路径（简化输出，不显示详细信息）
    for path in all_paths:
        if not path:
            continue
        
        if is_absolute_path(path):
            absolute_count += 1
            _, added_count = _process_absolute_path(path, existing_paths, verbose=False)
            existing_absolute_count += added_count
        else:
            relative_count += 1
            _, added_count = _process_relative_path(path, ma_dir, existing_paths, verbose=False)
            existing_relative_count += added_count
    
    # 查找XGen文件（使用MA文件来查找，确保只匹配Maya自动生成的.xgen文件）
    xgen_files = _find_xgen_files(ma_file_path)
    
    # 处理OCIO配置文件
    ocio_count_before = len(existing_paths)
    _process_ocio_configs(existing_paths)
    ocio_count = len(existing_paths) - ocio_count_before
    
    # 处理XGen文件
    xgen_count_before = len(existing_paths)
    _process_xgen_files(xgen_files, ma_file_path, ma_dir, existing_paths)
    xgen_count = len(existing_paths) - xgen_count_before
    
    # 输出统计信息（简化的 [1/3] 部分）
    logger.print_with_time(f"  [1/3] 从MA文件中提取到 {len(all_paths)} 个路径引用")
    if ocio_count > 0:
        logger.print_with_time(f"    从OCIO配置目录收集了 {ocio_count} 个文件")
    if xgen_count > 0:
        logger.print_with_time(f"    从XGen相关处理中收集了 {xgen_count} 个文件")
    logger.print_with_time("    路径统计:")
    logger.print_with_time(f"      绝对路径: {absolute_count} 个（存在: {existing_absolute_count} 个）")
    logger.print_with_time(f"      相对路径: {relative_count} 个（存在: {existing_relative_count} 个）")
    logger.print_with_time(f"      总计: {len(existing_paths)} 个文件")
    
    return sorted(existing_paths)

