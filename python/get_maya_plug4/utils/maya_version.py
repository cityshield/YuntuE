#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
获取本地机器的Maya版本信息
整合了MayaPathFinder和scene_parser的相关功能
"""

import os
import re
import subprocess
import functools
import string
import ctypes
# import ctypes.wintypes
import importlib.util
from typing import List, Dict, Optional

# 导入全局logger
from core.logger import logger

# 尝试导入 win32api（如果不可用，则相关方法自动跳过）
_win32_spec = importlib.util.find_spec("win32api")
if _win32_spec is not None:
    import win32api  # type: ignore
else:
    win32api = None  # type: ignore


class MayaPathFinder:
    """Maya路径查找器 - 整合版本"""
    
    def __init__(self, verbose: bool = False):
        """初始化查找器
        
        Args:
            verbose: 是否输出详细信息
        """
        self.verbose = verbose
        self.common_paths = [
            r"C:\Program Files\Autodesk",
            r"C:\Program Files (x86)\Autodesk",
            r"D:\Program Files\Autodesk",
            r"D:\Program Files (x86)\Autodesk",
            r"E:\Program Files\Autodesk",
            r"E:\Program Files (x86)\Autodesk",
        ]
    
    def find_all_maya_installations(self) -> List[str]:
        """查找所有Maya安装"""
        installations = []
        
        # 搜索常见路径
        if self.verbose:
            logger.print_with_time("搜索常见安装路径...")
        for base_path in self.common_paths:
            if os.path.exists(base_path):
                if self.verbose:
                    logger.print_with_time(f"  搜索: {base_path}")
                installations.extend(self._search_in_directory(base_path))
        
        # 全盘搜索（不论常用路径是否找到，都需要进行）
        if self.verbose:
            logger.print_with_time("开始全盘搜索Maya安装...")
        for drive_letter in string.ascii_uppercase:
            drive_path = f"{drive_letter}:\\"
            if os.path.exists(drive_path):
                try:
                    if self.verbose:
                        logger.print_with_time(f"  搜索磁盘: {drive_path}")
                    # 递归搜索整个驱动器（真正的全盘搜索）
                    found_installations = self._search_in_directory(drive_path)
                    installations.extend(found_installations)
                    if found_installations and self.verbose:
                        logger.print_with_time(f"    在 {drive_path} 找到 {len(found_installations)} 个安装")
                except (PermissionError, OSError) as e:
                    if self.verbose:
                        logger.print_with_time(f"    跳过磁盘 {drive_path}: {e}")
        
        # 去重并验证
        if self.verbose:
            logger.print_with_time("验证和去重Maya安装...")
        unique_installations = []
        seen_paths = set()
        for installation in installations:
            # 规范化路径（转换为小写并标准化）
            normalized_path = os.path.normpath(installation).lower()
            if normalized_path not in seen_paths and self._verify_maya_installation(installation):
                unique_installations.append(installation)
                seen_paths.add(normalized_path)
        
        if self.verbose:
            logger.print_with_time(f"搜索完成，找到 {len(unique_installations)} 个Maya安装")
        return unique_installations
    
    def _search_in_directory(self, directory: str) -> List[str]:
        """在指定目录中搜索Maya安装"""
        installations = []
        try:
            for root, dirs, files in os.walk(directory):
                if "maya.exe" in files:
                    if not self._is_installer_directory(root):
                        installations.append(root)
                    dirs.clear()
        except (PermissionError, OSError):
            pass
        return installations
    
    def _is_installer_directory(self, path: str) -> bool:
        """检查是否是安装包目录"""
        installer_markers = ['dlm', 'ADSK', '_dlm', 'Autodesk_Maya_', '\\x64\\', '/x64/']
        path_lowercase = path.lower()
        for installer_marker in installer_markers:
            if installer_marker.lower() in path_lowercase:
                return True
        return False
    
    def _verify_maya_installation(self, path: str) -> bool:
        """验证Maya安装是否有效"""
        maya_exe = os.path.join(path, "maya.exe")
        return os.path.exists(maya_exe)
    
    def get_maya_version(self, maya_path: str) -> Dict[str, str]:
        """获取Maya版本信息"""
        exe_version = self._get_version_from_exe(maya_path)
        cmd_version = self._get_version_from_command(maya_path)
        
        if exe_version:
            final_version = exe_version
            detection_method = "exe"
        elif cmd_version:
            final_version = cmd_version
            detection_method = "command"
        else:
            final_version = "Unknown"
            detection_method = "none"
        
        is_consistent = (exe_version == cmd_version) if (exe_version and cmd_version) else True
        warning = ""
        if not is_consistent:
            warning = f"EXE版本({exe_version})与命令行版本({cmd_version})不一致"
        
        return {
            'version': final_version,
            'method': detection_method,
            'exe_version': exe_version,
            'cmd_version': cmd_version,
            'is_consistent': is_consistent,
            'warning': warning
        }
    
    def _get_version_from_exe(self, maya_path: str) -> Optional[str]:
        """从maya.exe文件属性获取版本信息"""
        try:
            maya_exe = os.path.join(maya_path, "maya.exe")
            if not os.path.exists(maya_exe):
                return None
            
            version = self._get_version_with_ctypes(maya_exe)
            if version:
                return version
            
            version = self._get_version_with_pywin32(maya_exe)
            if version:
                return version
            
            version = self._get_version_with_powershell(maya_exe)
            if version:
                return version
        except Exception:
            pass
        return None
    
    def _get_version_with_ctypes(self, maya_exe: str) -> Optional[str]:
        """使用ctypes获取版本信息"""
        try:
            size = ctypes.windll.version.GetFileVersionInfoSizeW(maya_exe, None)
            if not size or size <= 0:
                return None
            
            buffer = ctypes.create_string_buffer(size)
            if not ctypes.windll.version.GetFileVersionInfoW(maya_exe, None, size, buffer):
                return None
            
            lplpBuffer = ctypes.c_void_p()
            uLen = ctypes.c_uint()
            
            if not ctypes.windll.version.VerQueryValueW(buffer, r'\VarFileInfo\Translation', ctypes.byref(lplpBuffer), ctypes.byref(uLen)):
                return None
            
            translation = ctypes.cast(lplpBuffer, ctypes.POINTER(ctypes.c_uint16 * 2)).contents
            lang_codepage = f"{translation[0]:04x}{translation[1]:04x}"
            
            version = self._get_string_version_with_ctypes(buffer, lang_codepage, "ProductVersion")
            if version:
                return version
            
            version = self._get_string_version_with_ctypes(buffer, lang_codepage, "FileVersion")
            if version:
                return version
        except Exception:
            pass
        return None
    
    def _get_string_version_with_ctypes(self, buffer, lang_codepage: str, version_type: str) -> Optional[str]:
        """使用ctypes获取字符串版本信息"""
        try:
            sub_block = f'\\StringFileInfo\\{lang_codepage}\\{version_type}'
            lplpBuffer = ctypes.c_void_p()
            uLen = ctypes.c_uint()
            
            if ctypes.windll.version.VerQueryValueW(buffer, sub_block, ctypes.byref(lplpBuffer), ctypes.byref(uLen)):
                version = ctypes.wstring_at(lplpBuffer)
                if version:
                    normalized = self._normalize_exe_version(version)
                    if normalized:
                        return normalized
        except Exception:
            pass
        return None
    
    def _get_version_with_pywin32(self, maya_exe: str) -> Optional[str]:
        """使用pywin32获取版本信息"""
        if win32api is None:  # type: ignore
            return None
        try:
            version_info = win32api.GetFileVersionInfo(maya_exe, "\\")
            if not version_info:
                return None
            
            translations = version_info.get('VarFileInfo', {}).get('Translation', [])
            if not translations:
                return None
            
            lang, codepage = translations[0]
            lang_codepage = f"{lang:04x}{codepage:04x}"
            
            product_version = win32api.GetFileVersionInfo(maya_exe, f"\\StringFileInfo\\{lang_codepage}\\ProductVersion")
            if product_version:
                normalized = self._normalize_exe_version(str(product_version))
                if normalized:
                    return normalized
            
            file_version = win32api.GetFileVersionInfo(maya_exe, f"\\StringFileInfo\\{lang_codepage}\\FileVersion")
            if file_version:
                normalized = self._normalize_exe_version(str(file_version))
                if normalized:
                    return normalized
        except ImportError:
            pass
        except Exception:
            pass
        return None
    
    def _get_version_with_powershell(self, maya_exe: str) -> Optional[str]:
        """使用PowerShell获取版本信息"""
        try:
            ps_command = f'Get-ItemProperty -Path "{maya_exe}" | Select-Object -ExpandProperty VersionInfo | Select-Object FileVersion, ProductVersion'
            result = subprocess.run(
                ['powershell', '-Command', ps_command],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0 or not result.stdout:
                return None
            
            return self._parse_powershell_output(result.stdout)
        except Exception:
            pass
        return None
    
    def _parse_powershell_output(self, output: str) -> Optional[str]:
        """解析PowerShell输出获取版本信息"""
        lines = output.strip().split('\n')
        for line in lines:
            if 'ProductVersion' in line and ':' in line:
                version = line.split(':')[1].strip()
                if version:
                    normalized = self._normalize_exe_version(version)
                    if normalized:
                        return normalized
            elif 'FileVersion' in line and ':' in line:
                version = line.split(':')[1].strip()
                if version:
                    normalized = self._normalize_exe_version(version)
                    if normalized:
                        return normalized
        return None
    
    def _normalize_exe_version(self, raw_version: str) -> Optional[str]:
        """将exe属性中的版本字符串标准化为"Maya YYYY"格式"""
        if not raw_version:
            return None
        head = str(raw_version).strip().split('.')[0]
        if not head.isdigit():
            return None
        if len(head) == 2:
            year = 2000 + int(head)
        elif len(head) == 4:
            year = int(head)
        else:
            return None
        if 2000 <= year <= 2099:
            return f"Maya {year}"
        return None
    
    def _get_version_from_command(self, maya_path: str) -> Optional[str]:
        """通过命令行获取Maya版本"""
        try:
            maya_exe = os.path.join(maya_path, "maya.exe")
            if not os.path.exists(maya_exe):
                return None
            
            result = subprocess.run(
                [maya_exe, "-v"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0 and result.stdout:
                output = result.stdout.strip()
                version_match = re.search(r'maya\s+(\d{4})', output.lower())
                if version_match:
                    year = version_match.group(1)
                    return f"Maya {year}"
                return output
        except Exception:
            pass
        return None
    
    def get_maya_version_list(self, maya_installations: List[str]) -> List[Dict[str, str]]:
        """整理Maya版本列表"""
        version_list = []
        
        for maya_path in maya_installations:
            version_info = self.get_maya_version(maya_path)
            
            version_year = "Unknown"
            if version_info['version'] != 'Unknown':
                year_match = re.search(r'(\d{4})', version_info['version'])
                if year_match:
                    version_year = year_match.group(1)
            
            version_item = {
                'version': f'Maya {version_year}',
                'maya_directory': maya_path
            }
            
            version_list.append(version_item)
        
        return version_list


def _read_mb_version_code(scene_path: str) -> str:
    """从.mb文件读取Maya版本年份"""
    with open(scene_path, 'rb') as f:
        data = f.read()
    
    ascii_blob = data.decode('latin-1', errors='ignore')
    
    # 匹配版本签名
    match = re.search(r'VERS[^\d]{0,64}(\d{4})(?:[A-Za-z0-9]{4})?\s*UVER', ascii_blob)
    if match:
        return f"{match.group(1)}"
    
    # 匹配product/version线索
    match = re.search(r'product\s+Maya\s+(\d{4})', ascii_blob)
    if not match:
        match = re.search(r'version\s+(\d{4})', ascii_blob)
    if match:
        return f"{match.group(1)}"
    raise ValueError('未能从.mb文件中解析Maya年份')


def _read_ma_version_year(scene_path: str) -> int:
    """从.ma文件读取Maya版本年份"""
    text_content = ''
    with open(scene_path, 'r', encoding='utf-8', errors='ignore') as f:
        text_content = f.read(4096)

    match = re.search(r'requires\s+maya\s+\"(\d{4})\"', text_content)
    if not match:
        match = re.search(r'Maya\s+ASCII\s+(\d{4})', text_content)
    if not match:
        match = re.search(r'fileInfo\s+\"product\"\s+\"Maya\s+(\d{4})\"', text_content)
    if not match:
        raise ValueError('未在.ma文件中解析到Maya年份')
    return int(match.group(1))


def get_scene_maya_year(scene_path: str) -> int:
    """从.mb/.ma场景读取Maya年份（不依赖mayapy）"""
    if not os.path.exists(scene_path):
        raise FileNotFoundError(scene_path)
    ext = os.path.splitext(scene_path)[1].lower()
    if ext == '.mb':
        code = _read_mb_version_code(scene_path)
        return int(code)
    elif ext == '.ma':
        return _read_ma_version_year(scene_path)
    else:
        raise ValueError(f'不支持的场景格式: {ext}')


@functools.lru_cache(maxsize=16)
def resolve_maya_bin_for_scene(scene_path: str) -> str:
    """根据场景内的Maya年份匹配本机Maya安装bin目录"""
    year = get_scene_maya_year(scene_path)
    finder = MayaPathFinder()
    maya_installations = finder.find_all_maya_installations()
    if not maya_installations:
        raise RuntimeError('本机未找到任何Maya安装')
    version_list = finder.get_maya_version_list(maya_installations)
    
    # 先精确匹配
    for version_item in version_list:
        version_str = version_item.get('version') or ''
        # 使用正则表达式精确匹配年份，避免误匹配（如2024匹配到20234）
        if re.search(r'\b' + str(year) + r'\b', version_str):
            return version_item['maya_directory']
    
    # 次优：取最近的更高版本
    if not version_list:
        raise RuntimeError('未找到任何Maya版本信息')
    
    def _to_year(version_str: str) -> int:
        match = re.search(r'(\d{4})', version_str or '')
        return int(match.group(1)) if match else -1
    sorted_version_list = sorted(version_list, key=lambda x: _to_year(x.get('version')), reverse=True)
    if not sorted_version_list:
        raise RuntimeError('无法确定Maya版本')
    return sorted_version_list[0]['maya_directory']


# if __name__ == "__main__":
#     # 测试：获取所有Maya安装
#     logger.print_with_time("获取所有Maya安装...")
#     finder = MayaPathFinder()
#     installations = finder.find_all_maya_installations()
#     logger.print_with_time(f"找到 {len(installations)} 个Maya安装")
    
#     for i, path in enumerate(installations, 1):
#         logger.print_with_time(f"  {i}. {path}")
