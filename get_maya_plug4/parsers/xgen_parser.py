#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
XGen 文件解析器
用于解析 .xgen 文件（文本格式），提取实际使用的文件列表
"""

import os
import re
from typing import List, Set, Dict

# 导入路径标准化函数
from utils.path_utils import normalize_path_separators
# 导入全局logger
from core.logger import logger


def parse_xgen_file(xgen_file_path: str, xgen_data_root: str) -> List[str]:
    """
    解析 .xgen 文件，返回所有引用的文件路径
    
    XGen 文件格式：自定义文本格式（非 XML）
    
    Args:
        xgen_file_path: .xgen 文件路径
        xgen_data_root: XGen 数据根目录（通常是 Project/xgen）
    
    Returns:
        引用的文件路径列表（绝对路径）
    """
    if not os.path.exists(xgen_file_path):
        return []
    
    referenced_files: Set[str] = set()
    
    try:
        # 读取文件内容
        with open(xgen_file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        # 解析 XGen 文件（文本格式）
        xgen_data = _parse_xgen_text_format(content)
        
        # 获取路径变量
        project_path = xgen_data.get('xgProjectPath', '')
        
        # 1. 提取 MapTextures 中的所有贴图（最直接的引用）
        map_textures = xgen_data.get('MapTextures', {})
        for texture_path in map_textures.values():
            absolute_path = _resolve_xgen_path(texture_path, xgen_data_root, project_path, 
                                          os.path.dirname(xgen_file_path))
            if absolute_path and os.path.exists(absolute_path):
                referenced_files.add(absolute_path)
        
        # 2. 提取 cacheFileName（如 guides.abc）
        for cache_file in xgen_data.get('cacheFileNames', []):
            absolute_path = _resolve_xgen_path(cache_file, xgen_data_root, project_path,
                                          os.path.dirname(xgen_file_path))
            if absolute_path and os.path.exists(absolute_path):
                referenced_files.add(absolute_path)
        
        # 3. 从表达式中提取 map() 函数引用的路径
        for map_reference in xgen_data.get('mapReferences', []):
            absolute_path = _resolve_xgen_path(map_reference, xgen_data_root, project_path,
                                          os.path.dirname(xgen_file_path))
            if absolute_path and os.path.exists(absolute_path):
                referenced_files.add(absolute_path)
        
        # 4. 收集 xgDataPath 指向的目录内容（根据实际路径）
        for data_path in xgen_data.get('xgDataPaths', []):
            absolute_path = _resolve_xgen_path(data_path, xgen_data_root, project_path,
                                          os.path.dirname(xgen_file_path))
            if absolute_path and os.path.exists(absolute_path) and os.path.isdir(absolute_path):
                # 收集该目录下的特定文件
                _collect_xgen_directory_files(absolute_path, referenced_files)
        
    except Exception as e:
        logger.warning(f"解析 XGen 文件失败: {xgen_file_path}, 错误: {e}")
    
    return sorted(list(referenced_files))


def _parse_xgen_text_format(content: str) -> Dict:
    """
    解析 XGen 文本格式
    
    XGen 文件格式示例：
        Palette
            name            wolf_fur_v02
            xgDataPath      ${PROJECT}xgen/collections/wolf_fur_v02
            xgProjectPath   C:/Project/.../Wolf/
        
        Description
            name            fur_of_body
            cacheFileName   ${DESC}/guides.abc
        
        MapTextures
            Clumping1    mask    E:/.../texture.iff
    
    Returns:
        解析后的数据字典
    """
    xgen_data = {
        'xgProjectPath': '',
        'xgDataPaths': [],
        'cacheFileNames': [],
        'mapReferences': [],
        'MapTextures': {}
    }
    
    lines = content.split('\n')
    in_map_textures = False
    
    for line in lines:
        stripped_line = line.strip()
        
        # 检查是否进入 MapTextures 部分
        if stripped_line == 'MapTextures':
            in_map_textures = True
            continue
        elif stripped_line == 'endAttrs' and in_map_textures:
            in_map_textures = False
            continue
        
        # 解析 MapTextures（三列格式：模块名 属性名 路径）
        if in_map_textures and '\t' in line:
            line_fields = line.split('\t')
            line_fields = [field.strip() for field in line_fields if field.strip()]
            if len(line_fields) >= 3:
                # 第三列是路径
                texture_path = line_fields[2]
                xgen_data['MapTextures'][f"{line_fields[0]}_{line_fields[1]}"] = texture_path
            continue
        
        # 解析键值对（用制表符或多个空格分隔）
        if '\t' in stripped_line or '  ' in stripped_line:
            # 分割键值对
            key_value_pair = re.split(r'\t+|\s{2,}', stripped_line, maxsplit=1)
            if len(key_value_pair) == 2:
                key, value = key_value_pair[0].strip(), key_value_pair[1].strip()
                
                # 收集特定的键
                if key == 'xgProjectPath' and value:
                    xgen_data['xgProjectPath'] = value
                elif key == 'xgDataPath' and value:
                    xgen_data['xgDataPaths'].append(value)
                elif key == 'cacheFileName' and value:
                    xgen_data['cacheFileNames'].append(value)
                
                # 从表达式中提取 map() 函数的路径
                if 'map(' in value:
                    map_paths = _extract_map_references(value)
                    xgen_data['mapReferences'].extend(map_paths)
    
    return xgen_data


def _extract_map_references(expression: str) -> List[str]:
    """
    从表达式中提取 map() 函数引用的路径
    
    示例：
        $a=map('${DESC}/paintmaps/fur_body_C01_mask')
        map('fur_of_groom/groom/width/')
    
    Returns:
        路径列表
    """
    map_paths = []
    
    # 匹配 map('...') 或 map("...")
    pattern = r"map\(['\"]([^'\"]+)['\"]\)"
    matches = re.findall(pattern, expression)
    
    for match in matches:
        # 移除末尾的 / 
        map_path = match.rstrip('/')
        if map_path:
            map_paths.append(map_path)
    
    return map_paths


def _resolve_xgen_path(relative_path: str, xgen_data_root: str, project_path: str, 
                      fallback_dir: str) -> str:
    """
    解析 XGen 相对路径为绝对路径，支持变量替换
    
    XGen 变量：
        ${PROJECT} - 替换为 xgProjectPath
        ${DESC} - 替换为 xgDataPath
    
    Args:
        relative_path: 相对路径（可能包含变量）
        xgen_data_root: XGen 数据根目录
        project_path: 项目路径（xgProjectPath）
        fallback_dir: 备用目录（通常是 .xgen 文件所在目录）
    
    Returns:
        绝对路径，如果文件不存在则返回空字符串
    """
    if not relative_path:
        return ""
    
    # 清理路径
    resolved_path = normalize_path_separators(relative_path).strip()
    
    # 替换 XGen 变量
    if '${PROJECT}' in resolved_path:
        if project_path:
            resolved_path = resolved_path.replace('${PROJECT}', project_path.rstrip('/') + '/')
        else:
            # 如果没有 project_path，尝试从 xgen_data_root 推导
            if xgen_data_root:
                project_root = os.path.dirname(os.path.dirname(xgen_data_root))
                resolved_path = resolved_path.replace('${PROJECT}', normalize_path_separators(project_root) + '/')
    
    if '${DESC}' in resolved_path:
        if xgen_data_root:
            resolved_path = resolved_path.replace('${DESC}', xgen_data_root.rstrip('/'))
    
    # 如果已经是绝对路径
    if os.path.isabs(resolved_path):
        # 检查路径是否存在（可能是其他盘符）
        if os.path.exists(resolved_path):
            return resolved_path
        
        # 如果不存在，可能是路径变了，尝试从文件名匹配
        file_name = os.path.basename(resolved_path)
        
        # 在 xgen_data_root 中查找
        if xgen_data_root and os.path.exists(xgen_data_root):
            for root_dir, dirs, files in os.walk(xgen_data_root):
                if file_name in files:
                    found_path = normalize_path_separators(os.path.join(root_dir, file_name))
                    return found_path
        
        return ""
    
    # 尝试相对于 xgen_data_root
    if xgen_data_root:
        absolute_path = normalize_path_separators(os.path.join(xgen_data_root, resolved_path))
        if os.path.exists(absolute_path):
            return absolute_path
    
    # 尝试相对于 project_path
    if project_path:
        absolute_path = normalize_path_separators(os.path.join(project_path, resolved_path))
        if os.path.exists(absolute_path):
            return absolute_path
    
    # 尝试相对于 fallback_dir
    if fallback_dir:
        absolute_path = normalize_path_separators(os.path.join(fallback_dir, resolved_path))
        if os.path.exists(absolute_path):
            return absolute_path
    
    return ""


def _collect_xgen_directory_files(directory: str, referenced_files: Set[str]):
    """
    收集 XGen 目录下的特定文件
    
    只收集：
    - 贴图文件 (.png, .jpg, .exr, .tif, .iff, .tga)
    - Alembic 文件 (.abc)
    - XGen 配置文件 (.xgc, .xgd)
    - MEL/Python 脚本 (.mel, .py)
    
    Args:
        directory: 目录路径
        referenced_files: 引用文件集合（会被修改）
    """
    if not os.path.exists(directory):
        return
    
    # 要收集的扩展名
    extensions = (
        '.png', '.jpg', '.jpeg', '.exr', '.tif', '.tiff', '.iff', '.tga',  # 贴图
        '.abc',                                                              # Alembic
        '.xgc', '.xgd',                                                      # XGen 配置
        '.mel', '.py'                                                        # 脚本
    )
    
    try:
        for root_dir, dirs, files in os.walk(directory):
            # 跳过一些明显的临时/备份目录
            dirs[:] = [dir_name for dir_name in dirs if dir_name.lower() not in ['backup', 'temp', 'cache', '.git']]
            
            for file_name in files:
                if file_name.lower().endswith(extensions):
                    file_path = normalize_path_separators(os.path.join(root_dir, file_name))
                    referenced_files.add(file_path)
    except Exception as e:
        logger.warning(f"收集目录文件失败: {directory}, 错误: {e}")




def collect_xgen_dependencies(xgen_file: str, xgen_data_root: str = None) -> List[str]:
    """
    收集 XGen 文件的所有依赖
    
    Args:
        xgen_file: .xgen 文件路径
        xgen_data_root: XGen 数据根目录，如果为 None 则自动检测
    
    Returns:
        依赖文件列表
    """
    if not os.path.exists(xgen_file):
        return []
    
    # 自动检测 xgen_data_root
    if not xgen_data_root:
        # 假设结构是 Project/scenes/xxx.xgen 和 Project/xgen/... 
        xgen_file_directory = os.path.dirname(xgen_file)
        if os.path.basename(xgen_file_directory).lower() == 'scenes':
            project_root = os.path.dirname(xgen_file_directory)
            xgen_data_root = os.path.join(project_root, 'xgen')
    
    if not xgen_data_root or not os.path.exists(xgen_data_root):
        logger.warning(f"找不到 XGen 数据目录: {xgen_data_root}")
        return []
    
    # 解析文件
    return parse_xgen_file(xgen_file, xgen_data_root)



