#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Maya场景文件处理器
封装从Maya场景文件生成upload.json的完整流程
"""

import os
import re
import json
from datetime import datetime
from contextlib import contextmanager
from typing import List, Dict, Any, Optional

from utils.maya_version import MayaPathFinder, get_scene_maya_year
from parsers.scene_inspector import (
    resolve_mayapy_path,
    fix_ma_render_path,
    convert_mb_to_ma,
    run_maya_script
)
from builders.package_builder import (
    build_upload_mapping,
    save_upload_json,
    create_upload_package
)
from core.logger import Logger


class MayaSceneProcessor:
    """Maya场景文件处理器类"""
    
    def __init__(
        self,
        scene_path: str,
        output_dir: str,
        server_root: str = "",
        logger: Optional[Logger] = None
    ):
        """
        初始化处理器
        
        Args:
            scene_path: Maya场景文件路径（.mb 或 .ma）
            output_dir: 输出目录
            server_root: 服务器根路径（空字符串=简洁路径格式）
            logger: 日志管理器（如果为None，则创建默认日志管理器）
        """
        self.scene_path = scene_path
        self.output_dir = output_dir
        self.server_root = server_root
        self.is_mb = False
        self.maya_bin_dir = None
        self.mayapy_path = None
        self.render_json_path = None
        self.upload_path = None
        self.zip_path = None
        
        # 日志管理器
        if logger is None:
            # 默认：仅输出到控制台
            self.logger = Logger(console_output=True, file_output=False)
        else:
            self.logger = logger
    
    @contextmanager
    def _temporary_files_cleanup(self, is_mb_file: bool):
        """
        上下文管理器：自动清理临时文件
        
        Args:
            is_mb_file: 是否是MB文件（只有MB转MA才需要清理）
        """
        temp_files = []
        try:
            yield temp_files
        finally:
            if is_mb_file and temp_files:
                self._cleanup_files(temp_files)
    
    def _cleanup_files(self, file_paths: List[str]) -> None:
        """清理文件列表"""
        self.logger.print_with_time("清理临时文件")
        self.logger.separator()
        
        deleted, failed = [], []
        for file_path in file_paths:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    deleted.append(os.path.basename(file_path))
                    self.logger.print_with_time(f"已删除: {file_path}")
            except OSError as e:
                failed.append(os.path.basename(file_path))
                self.logger.warning(f"删除失败 {file_path}: {e}")
        
        if deleted:
            self.logger.print_with_time(f"成功删除 {len(deleted)} 个文件")
        if failed:
            self.logger.warning(f"失败 {len(failed)} 个文件，请手动删除")
        self.logger.print_with_time("")
    
    def _cleanup_xgen_files(self, scene_dir: str, scene_basename: str) -> None:
        """清理XGen临时文件"""
        if not os.path.exists(scene_dir):
            return
        
        deleted = 0
        try:
            for file_name in os.listdir(scene_dir):
                if file_name.lower().endswith('.xgen') and file_name.startswith(scene_basename):
                    xgen_path = os.path.join(scene_dir, file_name)
                    try:
                        os.remove(xgen_path)
                        deleted += 1
                        self.logger.print_with_time(f"已删除XGen文件: {xgen_path}")
                    except OSError as e:
                        self.logger.warning(f"删除XGen文件失败: {e}")
        except OSError as e:
            self.logger.warning(f"查找XGen文件失败: {e}")
        
        if deleted > 0:
            self.logger.print_with_time(f"共删除 {deleted} 个XGen文件")
    
    def _validate_scene_file(self) -> str:
        """验证场景文件，返回扩展名"""
        if not os.path.exists(self.scene_path):
            raise FileNotFoundError(f"场景文件不存在: {self.scene_path}")
        
        _, ext = os.path.splitext(self.scene_path.lower())
        if ext not in ['.ma', '.mb']:
            raise ValueError(f"不支持的文件格式: {ext}，支持: .mb 或 .ma")
        
        return ext
    
    def _find_maya_version(self, year: int, finder: MayaPathFinder, installations: List[str]) -> str:
        """
        查找匹配的Maya版本，返回bin目录
        如果匹配到多个版本，优先使用盘符小的路径（C < D < E）
        """
        version_list = finder.get_maya_version_list(installations)
        
        # 收集所有匹配的版本
        matched_versions = []
        for item in version_list:
            if re.search(r'\b' + str(year) + r'\b', item.get('version', '')):
                matched_versions.append(item)
        
        if not matched_versions:
            raise RuntimeError(f"未找到匹配Maya {year}的安装")
        
        # 如果只有一个匹配，直接返回
        if len(matched_versions) == 1:
            return matched_versions[0]['maya_directory']
        
        # 多个匹配时，按盘符排序（C < D < E）
        def _get_drive_priority(path: str) -> int:
            """获取路径的盘符优先级，盘符越小优先级越高"""
            path_upper = path.upper()
            # 提取盘符（如 C:, D:, E:）
            if len(path_upper) >= 2 and path_upper[1] == ':':
                drive_letter = path_upper[0]
                # 返回字母的 ASCII 值作为优先级（A=65, B=66, C=67...）
                return ord(drive_letter)
            # 如果不是标准盘符路径，返回一个很大的值（低优先级）
            return 999
        
        # 按盘符排序
        matched_versions.sort(key=lambda x: _get_drive_priority(x['maya_directory']))
        
        selected = matched_versions[0]
        selected_path = selected['maya_directory']
        
        # 如果有多个匹配，打印提示信息
        if len(matched_versions) > 1:
            self.logger.print_with_time(f"找到 {len(matched_versions)} 个匹配的Maya {year}安装:")
            for idx, item in enumerate(matched_versions, 1):
                marker = " (已选择)" if item == selected else ""
                self.logger.print_with_time(f"  {idx}. {item['maya_directory']}{marker}")
        
        return selected_path
    
    def _get_renderer_info(self, scene_data: Dict[str, Any]) -> tuple:
        """获取渲染器和版本信息"""
        renderer = scene_data.get('renderer')
        renderer = renderer if renderer and renderer != 'unknown' else None
        
        renderer_version = None
        if renderer:
            plugins = scene_data.get('plugins', [])
            renderer_name = renderer.lower()
            
            # 根据渲染器类型查找对应插件版本
            renderer_plugin_map = {
                'arnold': 'mtoa',
                'vray': 'vrayformaya',
                'redshift': 'redshift4maya',
                'renderman': 'RenderMan_for_Maya'
            }
            
            plugin_name = renderer_plugin_map.get(renderer_name)
            if plugin_name:
                for plugin in plugins:
                    if plugin_name.lower() in plugin.get('name', '').lower():
                        renderer_version = plugin.get('version')
                        break
        
        return renderer, renderer_version
    
    def _get_output_format(self, globals_settings: Dict[str, Any], renderer: Optional[str]) -> tuple:
        """获取输出格式（显式设置和实际使用）"""
        # 格式代码到格式名称的映射
        format_names = {
            0: 'iff', 1: 'soft', 2: 'rla', 3: 'tiff', 4: 'tif',
            5: 'sgi', 6: 'als', 7: 'jpg', 8: 'jpg', 9: 'maya',
            10: 'cineon', 11: 'quantel', 19: 'targa', 20: 'bmp',
            31: 'psd', 32: 'png', 35: 'dds', 36: 'psd', 50: 'exr'
        }
        
        # 不同渲染器的默认输出格式
        renderer_default_formats = {
            'arnold': 'exr',
            'vray': 'exr',
            'redshift': 'exr',
            'renderman': 'exr',
            'mayasoftware': 'iff',
            'mayahardware': 'iff',
            'mayahardware2': 'png',
        }
        
        image_format_code = globals_settings.get('imageFormat')
        output_format_set = None
        output_format_actual = None
        
        if image_format_code is not None:
            # MA文件中有显式设置 imageFormat
            output_format_set = format_names.get(image_format_code)
            if output_format_set:
                output_format_actual = output_format_set
            else:
                # 格式代码不在映射表中，回退到渲染器默认格式
                output_format_set = None
                if renderer:
                    output_format_actual = renderer_default_formats.get(renderer.lower(), 'png')
                else:
                    output_format_actual = 'png'
        else:
            # MA文件中未设置 imageFormat，根据渲染器类型推断
            output_format_set = None
            if renderer:
                output_format_actual = renderer_default_formats.get(renderer.lower(), 'png')
            else:
                output_format_actual = 'png'
        
        return output_format_set, output_format_actual
    
    def _extract_render_settings(self, scene_data: Dict[str, Any]) -> Dict[str, Any]:
        """从场景数据中提取渲染参数（只获取实际值，不使用默认值）"""
        render_settings = {}
        
        # 渲染器和版本
        renderer, renderer_version = self._get_renderer_info(scene_data)
        render_settings['renderer'] = renderer
        render_settings['renderer_version'] = renderer_version
        
        # 渲染分辨率
        resolution = scene_data.get('render_settings', {}).get('defaultResolution', {})
        render_settings['resolution'] = {
            'width': resolution.get('width') if 'width' in resolution else None,
            'height': resolution.get('height') if 'height' in resolution else None
        }
        
        # 帧范围和步长
        globals_settings = scene_data.get('render_settings', {}).get('defaultRenderGlobals', {})
        render_settings['frame_range'] = {
            'start_frame': globals_settings.get('startFrame') if 'startFrame' in globals_settings else None,
            'end_frame': globals_settings.get('endFrame') if 'endFrame' in globals_settings else None,
            'by_frame_step': globals_settings.get('byFrameStep') if 'byFrameStep' in globals_settings else None
        }
        
        # 渲染相机
        render_cameras = scene_data.get('render_settings', {}).get('render_cameras', [])
        render_settings['render_cameras'] = render_cameras if render_cameras else None
        
        # 输出格式
        output_format_set, output_format_actual = self._get_output_format(globals_settings, renderer)
        render_settings['output_format'] = output_format_set
        render_settings['output_format_actual'] = output_format_actual
        
        # 输出路径
        render_path = scene_data.get('render_path', {})
        image_file_prefix = render_path.get('imageFilePrefix')
        render_settings['output_path'] = image_file_prefix if image_file_prefix else None
        
        # 渲染设备（CPU/GPU）
        render_device = scene_data.get('render_settings', {}).get('render_device')
        render_settings['render_device'] = render_device if render_device else None
        
        return render_settings
    
    def _save_render_settings(self, render_settings: Dict[str, Any]) -> str:
        """保存渲染参数到JSON文件"""
        render_json_path = os.path.join(self.output_dir, 'render_settings.json')
        os.makedirs(self.output_dir, exist_ok=True)
        
        with open(render_json_path, 'w', encoding='utf-8') as f:
            json.dump(render_settings, f, ensure_ascii=False, indent=2)
        
        return render_json_path
    
    def _display_render_settings(self, render_settings: Dict[str, Any]) -> None:
        """显示渲染参数"""
        self.logger.print_with_time("渲染参数:")
        
        # 渲染器
        renderer = render_settings['renderer'] or '未设置'
        renderer_version = render_settings['renderer_version'] or ''
        if renderer_version:
            self.logger.print_with_time(f"  渲染器: {renderer} {renderer_version}")
        else:
            self.logger.print_with_time(f"  渲染器: {renderer}")
        
        # 分辨率
        width = render_settings['resolution']['width']
        height = render_settings['resolution']['height']
        if width and height:
            self.logger.print_with_time(f"  分辨率: {int(width)}x{int(height)}")
        
        # 帧范围
        start = render_settings['frame_range']['start_frame']
        end = render_settings['frame_range']['end_frame']
        step = render_settings['frame_range']['by_frame_step']
        if start is not None and end is not None:
            frame_info = f"{int(start)}-{int(end)}"
            if step and step != 1:
                frame_info += f" (步长:{int(step)})"
            self.logger.print_with_time(f"  帧范围: {frame_info}")
        
        # 相机
        cameras = render_settings['render_cameras']
        if cameras:
            cam_names = [c.split(':')[-1] for c in cameras]  # 只显示最后一部分
            self.logger.print_with_time(f"  相机: {', '.join(cam_names)}")
        
        # 输出格式
        output_format_actual = render_settings.get('output_format_actual')
        if output_format_actual:
            self.logger.print_with_time(f"  格式: {output_format_actual}")
        
        # 渲染设备
        render_device = render_settings.get('render_device')
        if render_device:
            device_display = "GPU" if render_device == "gpu" else "CPU"
            self.logger.print_with_time(f"  渲染设备: {device_display}")
    
    def _step1_validate_scene(self) -> None:
        """步骤1: 验证场景文件"""
        self.logger.print_with_time("步骤 1/9: 读取场景文件")
        file_ext = self._validate_scene_file()
        self.is_mb = (file_ext == '.mb')
        self.logger.print_with_time(f"  类型: {file_ext.upper().lstrip('.')} | 路径: {os.path.basename(self.scene_path)}")
        self.logger.print_with_time("")
    
    def _step2_get_maya_version(self) -> int:
        """步骤2: 获取Maya版本"""
        self.logger.print_with_time("步骤 2/9: 获取场景Maya版本")
        year = get_scene_maya_year(self.scene_path)
        self.logger.print_with_time(f"  版本: Maya {year}")
        self.logger.print_with_time("")
        return year
    
    def _step3_find_maya_installations(self) -> tuple:
        """步骤3: 搜索Maya安装"""
        self.logger.print_with_time("步骤 3/9: 搜索本地Maya安装")
        finder = MayaPathFinder(verbose=False)  # 不显示详细搜索过程
        installations = finder.find_all_maya_installations()
        self.logger.print_with_time(f"  找到 {len(installations)} 个Maya安装")
        self.logger.print_with_time("")
        return finder, installations
    
    def _step4_match_maya_version(self, year: int, finder: MayaPathFinder, installations: List[str]) -> None:
        """步骤4: 匹配Maya版本"""
        self.logger.print_with_time("步骤 4/9: 匹配Maya版本")
        self.maya_bin_dir = self._find_maya_version(year, finder, installations)
        self.mayapy_path = resolve_mayapy_path(self.maya_bin_dir)
        self.logger.print_with_time(f"  使用: {os.path.basename(os.path.dirname(self.maya_bin_dir))}")
        self.logger.print_with_time("")
    
    def process(self) -> None:
        """执行完整的处理流程"""
        # 打印标题
        self.logger.section("从Maya场景文件生成upload.json")
        self.logger.print_with_time(f"场景文件: {self.scene_path}")
        self.logger.print_with_time(f"输出目录: {self.output_dir}")
        self.logger.separator("=")
        self.logger.print_with_time("")
        
        # 步骤1-4: 准备工作
        self._step1_validate_scene()
        year = self._step2_get_maya_version()
        finder, installations = self._step3_find_maya_installations()
        self._step4_match_maya_version(year, finder, installations)
        
        # 步骤5-9: 主处理流程
        with self._temporary_files_cleanup(self.is_mb) as temp_files:
            current_scene_path = self._step5_convert_mb_to_ma(temp_files)
            scene_data = self._step6_read_and_fix_scene(current_scene_path)
            self._step6_extract_and_save_render_settings(scene_data)
            upload_mapping = self._step7_build_upload_mapping(current_scene_path)
            self._step8_save_upload_json(upload_mapping)
            self._step9_create_package(current_scene_path)
            self._cleanup_xgen_if_needed(current_scene_path)
        
        # 完成提示
        self._print_completion_summary()
    
    def _step5_convert_mb_to_ma(self, temp_files: List[str]) -> str:
        """步骤5: MB转MA（如果需要）"""
        current_scene_path = self.scene_path
        
        if self.is_mb:
            self.logger.print_with_time("步骤 5/9: 转换MB到MA")
            
            scene_dir = os.path.dirname(os.path.abspath(current_scene_path))
            scene_basename = os.path.splitext(os.path.basename(current_scene_path))[0]
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            ma_path = os.path.join(scene_dir, f"{scene_basename}_{timestamp}.ma")
            
            if not convert_mb_to_ma(self.mayapy_path, current_scene_path, ma_path):
                raise RuntimeError("MB转MA失败")
            
            temp_files.append(ma_path)
            current_scene_path = ma_path
            self.logger.print_with_time(f"  转换完成: {os.path.basename(ma_path)}")
            self.logger.print_with_time("")
        else:
            self.logger.print_with_time("步骤 5/9: 场景文件检查")
            self.logger.print_with_time(f"  文件已是MA格式，无需转换")
            self.logger.print_with_time("")
        
        return current_scene_path
    
    def _step6_read_and_fix_scene(self, scene_path: str) -> Dict[str, Any]:
        """步骤6: 读取场景信息并处理渲染路径"""
        self.logger.print_with_time("步骤 6/9: 读取场景信息")
        
        # 读取场景数据
        scene_data = run_maya_script(self.mayapy_path, scene_path)
        
        # 处理渲染路径（如果需要修改绝对路径）
        render_path_info = scene_data.get('render_path', {})
        image_file_prefix = render_path_info.get('imageFilePrefix', '')
        is_absolute = render_path_info.get('is_absolute', False)
        
        if is_absolute and image_file_prefix:
            self.logger.print_with_time("  修正渲染路径为相对路径...")
            if fix_ma_render_path(scene_path, self.mayapy_path, is_absolute, image_file_prefix):
                scene_data = run_maya_script(self.mayapy_path, scene_path)
            else:
                self.logger.warning("  路径修正失败")
        self.logger.print_with_time("")
        
        return scene_data
    
    def _step6_extract_and_save_render_settings(self, scene_data: Dict[str, Any]) -> None:
        """步骤6: 提取并保存渲染参数"""
        render_settings = self._extract_render_settings(scene_data)
        self._display_render_settings(render_settings)
        self.render_json_path = self._save_render_settings(render_settings)
        self.logger.print_with_time("")
    
    def _step7_build_upload_mapping(self, scene_path: str) -> Dict[str, Any]:
        """步骤7: 生成upload.json映射"""
        self.logger.print_with_time("步骤 7/9: 生成文件映射")
        upload_mapping = build_upload_mapping(scene_path, self.server_root)
        file_count = len(upload_mapping.get('assets', [])) + 1  # +1 for scene file
        self.logger.print_with_time(f"  映射完成: {file_count} 个文件")
        self.logger.print_with_time("")
        return upload_mapping
    
    def _step8_save_upload_json(self, upload_mapping: Dict[str, Any]) -> None:
        """步骤8: 保存upload.json"""
        self.logger.print_with_time("步骤 8/9: 保存upload.json")
        os.makedirs(self.output_dir, exist_ok=True)
        self.upload_path = os.path.join(self.output_dir, 'upload.json')
        save_upload_json(upload_mapping, self.upload_path)
        self.logger.print_with_time(f"  保存完成")
        self.logger.print_with_time("")
    
    def _step9_create_package(self, scene_path: str) -> None:
        """步骤9: 打包文件"""
        self.logger.print_with_time("步骤 9/9: 创建压缩包")
        # 获取场景文件名和后缀名
        scene_basename = os.path.splitext(os.path.basename(self.scene_path))[0]
        scene_ext = os.path.splitext(os.path.basename(self.scene_path))[1].lstrip('.')  # 去掉点号
        # 生成 zip 文件名：场景文件名_后缀名.zip
        package_filename = f"{scene_basename}_{scene_ext}.zip"
        self.zip_path = os.path.join(self.output_dir, package_filename)
        create_upload_package(scene_path, self.upload_path, self.server_root, self.zip_path, self.render_json_path)
        # 获取zip文件大小
        if os.path.exists(self.zip_path):
            size_mb = os.path.getsize(self.zip_path) / (1024 * 1024)
            self.logger.print_with_time(f"  打包完成: {size_mb:.2f} MB")
        self.logger.print_with_time("")
    
    def _cleanup_xgen_if_needed(self, scene_path: str) -> None:
        """清理XGen临时文件（如果需要）"""
        if self.is_mb:
            scene_dir = os.path.dirname(scene_path)
            scene_basename = os.path.splitext(os.path.basename(scene_path))[0]
            self._cleanup_xgen_files(scene_dir, scene_basename)
    
    def _print_completion_summary(self) -> None:
        """打印完成摘要"""
        self.logger.section("处理完成")
        self.logger.print_with_time(f"输出目录: {self.output_dir}")
        self.logger.print_with_time(f"  - render_settings.json")
        self.logger.print_with_time(f"  - upload.json")
        if self.zip_path:
            self.logger.print_with_time(f"  - {os.path.basename(self.zip_path)}")
        if self.is_mb:
            self.logger.print_with_time("")
            self.logger.print_with_time("注意: 原MB文件未修改")
        self.logger.separator("=")
