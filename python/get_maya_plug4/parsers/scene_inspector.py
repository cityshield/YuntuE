#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Maya工具函数模块
包含Maya版本获取、场景解析等核心功能
"""

import os
import re
import json
import subprocess
import tempfile
import traceback
from typing import Dict, Any, Optional, Tuple

# 导入路径标准化函数
from utils.path_utils import normalize_path_separators
# 导入全局logger
from core.logger import logger


def resolve_mayapy_path(maya_bin_dir: str) -> str:
    """从Maya bin目录解析mayapy路径"""
    if not maya_bin_dir:
        raise ValueError("maya_bin_dir 不能为空")
    candidate_paths = [
        os.path.join(maya_bin_dir, 'mayapy.exe'),
        os.path.join(maya_bin_dir, 'mayapy')
    ]
    for candidate_path in candidate_paths:
        if os.path.exists(candidate_path):
            return candidate_path
    raise FileNotFoundError(f"未在 {maya_bin_dir} 找到 mayapy")


def _generate_mayapy_inspect_script() -> str:
    """生成Maya场景检查脚本"""
    return '''#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import maya.standalone
maya.standalone.initialize()
import maya.cmds as cmds
import sys
import json
import os
import re

def safe_list(list_data):
    return list_data if list_data else []

scene_path = sys.argv[1]
out_json = sys.argv[2] if len(sys.argv) > 2 else None

result = {
    "scene_file": scene_path,
    "renderer": "unknown",
    "render_layers": [],
    "cameras": [],
    "references": [],
    "file_textures": [],
    "plugins": [],
    "project": {"workspace": "", "units": {}, "timeline": {}, "color_management": {}},
    "render_settings": {"defaultRenderGlobals": {}, "defaultResolution": {}, "render_cameras": [], "aovs": []},
    "render_path": {"imageFilePrefix": "", "is_absolute": False, "outFormatControl": 0, "workspace_images": ""},
    "nodes": {"counts": {}, "unknown": [], "namespaces": []},
    "external_files": {"alembic": [], "usd": [], "gpuCache": [], "aiImage": [], "aiStandIn": [], "cacheFile": [], "diskCache": [], "xgen": [], "xgen_data_dirs": [], "mash_audio": [], "particleCache": [], "filePathEditor": {}}
}

try:
    cmds.file(scene_path, open=True, force=True)
    
    # 先获取项目信息（workspace需要在修复纹理路径前获取）
    try:
        result["project"]["workspace"] = cmds.workspace(q=True, rootDirectory=True)
    except:
        pass
    
    # 渲染器
    try:
        result["renderer"] = cmds.getAttr("defaultRenderGlobals.currentRenderer") or "unknown"
    except:
        pass
    
    # 渲染层
    try:
        result["render_layers"] = safe_list(cmds.ls(type='renderLayer'))
    except:
        pass
    
    # 相机
    try:
        result["cameras"] = [cmds.listRelatives(cam, parent=True, fullPath=False)[0] if cmds.listRelatives(cam, parent=True) else cam 
                             for cam in safe_list(cmds.ls(type='camera'))]
    except:
        pass
    
    # 引用
    try:
        result["references"] = safe_list(cmds.file(q=True, r=True))
    except:
        pass
    
    # 文件纹理（收集并修复绝对路径）
    try:
        workspace = result["project"].get("workspace", "")
        for f in safe_list(cmds.ls(type='file')):
            fn = cmds.getAttr(f"{f}.fileTextureName")
            if fn:
                result["file_textures"].append(fn)
                
                # 修复绝对路径为相对路径
                if workspace and os.path.isabs(fn):
                    try:
                        # 尝试转换为相对于workspace的路径
                        rel_path = os.path.relpath(fn, workspace)
                        # 如果相对路径不是以..开头（即在workspace内），则使用相对路径
                        if not rel_path.startswith('..'):
                            cmds.setAttr(f"{f}.fileTextureName", rel_path.replace('\\\\', '/'), type="string")
                    except:
                        pass
    except:
        pass
    
    # 收集外部文件
    # 1. Alembic 缓存
    try:
        for node in safe_list(cmds.ls(type='AlembicNode')):
            fn = cmds.getAttr(f"{node}.abc_File")
            if fn:
                result["external_files"]["alembic"].append(fn)
    except:
        pass
    
    # 2. USD 文件
    try:
        for node in safe_list(cmds.ls(type='mayaUsdProxyShape')):
            fn = cmds.getAttr(f"{node}.filePath")
            if fn:
                result["external_files"]["usd"].append(fn)
    except:
        pass
    
    # 3. GPU Cache
    try:
        for node in safe_list(cmds.ls(type='gpuCache')):
            fn = cmds.getAttr(f"{node}.cacheFileName")
            if fn:
                result["external_files"]["gpuCache"].append(fn)
    except:
        pass
    
    # 4. Arnold Stand-In
    try:
        for node in safe_list(cmds.ls(type='aiStandIn')):
            fn = cmds.getAttr(f"{node}.dso")
            if fn:
                result["external_files"]["aiStandIn"].append(fn)
    except:
        pass
    
    # 5. Arnold Image (aiImage)
    try:
        for node in safe_list(cmds.ls(type='aiImage')):
            fn = cmds.getAttr(f"{node}.filename")
            if fn:
                result["external_files"]["aiImage"].append(fn)
    except:
        pass
    
    # 6. Cache File (缓存文件)
    try:
        for node in safe_list(cmds.ls(type='cacheFile')):
            fn = cmds.getAttr(f"{node}.cachePath")
            if fn:
                cache_name = cmds.getAttr(f"{node}.cacheName")
                if cache_name:
                    # 组合路径和文件名
                    full_path = os.path.join(fn, cache_name + ".xml").replace("\\\\", "/")
                    result["external_files"]["cacheFile"].append(full_path)
                else:
                    result["external_files"]["cacheFile"].append(fn)
    except:
        pass
    
    # 7. Disk Cache (磁盘缓存)
    try:
        for node in safe_list(cmds.ls(type='diskCache')):
            fn = cmds.getAttr(f"{node}.cacheName")
            if fn:
                result["external_files"]["diskCache"].append(fn)
    except:
        pass
    
    # 8. XGen 文件 (重要!) - 使用 Maya API 详细收集
    try:
        xgen_files = []
        xgen_data_dirs = []
        xgen_detailed_files = []  # 详细的文件列表（贴图、缓存等）
        
        # 方法1: 查找 xgenDescription 节点（新方法，更准确）
        for node in safe_list(cmds.ls(type='xgenDescription')):
            try:
                # 获取 fileName 属性（.xgen 文件路径）
                file_path = cmds.getAttr(f"{node}.fileName")
                if file_path:
                    xgen_files.append(file_path)
                    
                # 收集该 description 的所有相关文件
                # 1. 获取所有文件纹理属性
                attrs_to_check = [
                    'clumpMap', 'densityMap', 'lengthMap', 'widthMap',
                    'maskMap', 'regionMap', 'colorMap', 'specularMap',
                    'cutMap', 'coilMap', 'offsetMap'
                ]
                
                for attr in attrs_to_check:
                    try:
                        attr_value = cmds.getAttr(f"{node}.{attr}")
                        if attr_value and isinstance(attr_value, str):
                            xgen_detailed_files.append(attr_value)
                    except:
                        pass
                
                # 2. 获取 guide 文件（通常是 .abc 文件）
                try:
                    guide_file = cmds.getAttr(f"{node}.cacheFileName")
                    if guide_file:
                        xgen_detailed_files.append(guide_file)
                except:
                    pass
                
            except Exception as e:
                pass
        
        # 方法2: 查找 xgmDescription 节点（旧方法，兼容）
        for node in safe_list(cmds.ls(type='xgmDescription')):
            try:
                xgen_file = cmds.getAttr(f"{node}.xgFileName")
                if xgen_file:
                    xgen_files.append(xgen_file)
                    
                # 获取XGen数据目录
                try:
                    xgen_data_path = cmds.getAttr(f"{node}.xgDataPath")
                    if xgen_data_path:
                        xgen_data_dirs.append(xgen_data_path)
                except:
                    pass
            except:
                pass
        
        # 方法3: 查找 xgmPalette 节点
        for node in safe_list(cmds.ls(type='xgmPalette')):
            try:
                xgen_file = cmds.getAttr(f"{node}.xgFileName")
                if xgen_file:
                    xgen_files.append(xgen_file)
                    
                # 获取XGen数据目录
                try:
                    xgen_data_path = cmds.getAttr(f"{node}.xgDataPath")
                    if xgen_data_path:
                        xgen_data_dirs.append(xgen_data_path)
                except:
                    pass
            except:
                pass
        
        # 方法4: 从场景目录查找 .xgen 文件（作为补充）
        scene_dir = os.path.dirname(scene_path)
        scene_name = os.path.splitext(os.path.basename(scene_path))[0]
        if os.path.exists(scene_dir):
            for f in os.listdir(scene_dir):
                if f.endswith('.xgen') and scene_name in f:
                    xgen_path = os.path.join(scene_dir, f).replace("\\\\", "/")
                    xgen_files.append(xgen_path)
        
        # 自动查找xgen数据目录（如果项目结构标准的话）
        # 标准结构: Project/scenes/xxx.ma 和 Project/xgen/...
        project_root = os.path.dirname(scene_dir)
        if os.path.basename(scene_dir).lower() == 'scenes':
            xgen_dir = os.path.join(project_root, 'xgen')
            if os.path.exists(xgen_dir) and os.path.isdir(xgen_dir):
                xgen_data_dirs.append(xgen_dir.replace("\\\\", "/"))
        
        # 去重
        result["external_files"]["xgen"] = list(set(xgen_files))
        result["external_files"]["xgen_data_dirs"] = list(set(xgen_data_dirs))
        result["external_files"]["xgen_detailed_files"] = list(set(xgen_detailed_files))  # 从节点属性收集的详细文件
    except:
        pass
    
    # 9. MASH 音频文件
    try:
        for node in safe_list(cmds.ls(type='MASH_Audio')):
            fn = cmds.getAttr(f"{node}.filename")
            if fn:
                result["external_files"].setdefault("mash_audio", []).append(fn)
    except:
        pass
    
    # 10. 粒子缓存 (particleCache)
    try:
        for node in safe_list(cmds.ls(type='particleCache')):
            fn = cmds.getAttr(f"{node}.cachePath")
            if fn:
                result["external_files"].setdefault("particleCache", []).append(fn)
    except:
        pass
    
    # 插件
    try:
        loaded = safe_list(cmds.pluginInfo(q=True, listPlugins=True))
        for p in loaded:
            try:
                ver = cmds.pluginInfo(p, q=True, version=True)
                result["plugins"].append({"name": p, "version": ver})
            except:
                result["plugins"].append({"name": p})
    except:
        pass
    
    # 修复 Arnold GPU 设置（如果使用 Arnold）
    try:
        if result["renderer"] == "arnold":
            # 检查是否有 Arnold 渲染选项节点
            if cmds.objExists('defaultArnoldRenderOptions'):
                # 获取当前GPU设置
                try:
                    # 重置 GPU 索引为 0（使用第一个GPU）
                    # 这可以避免 "device id out of range" 错误
                    if cmds.attributeQuery('gpu_default_min_texture_res', node='defaultArnoldRenderOptions', exists=True):
                        # 如果是新版本Arnold，使用device列表
                        pass  # 保持默认设置
                except:
                    pass
    except:
        pass
    
    # 色彩空间信息（Color Space / Color Management）
    try:
        color_mgmt = {}
        
        # 1. Maya色彩管理模式
        try:
            # 检查是否启用色彩管理
            color_mgmt_enabled = cmds.colorManagementPrefs(q=True, cmEnabled=True)
            color_mgmt["enabled"] = color_mgmt_enabled
            
            if color_mgmt_enabled:
                # 色彩管理策略（transformConnection, synColor, etc.）
                try:
                    color_mgmt["policy"] = cmds.colorManagementPrefs(q=True, cmConfigFileEnabled=True)
                except:
                    pass
                
                # 渲染空间
                try:
                    rendering_space = cmds.colorManagementPrefs(q=True, renderingSpaceName=True)
                    color_mgmt["rendering_space"] = rendering_space
                except:
                    pass
                
                # 视图变换
                try:
                    view_transform = cmds.colorManagementPrefs(q=True, viewTransformName=True)
                    color_mgmt["view_transform"] = view_transform
                except:
                    pass
                
                # 显示
                try:
                    display_name = cmds.colorManagementPrefs(q=True, displayName=True)
                    color_mgmt["display"] = display_name
                except:
                    pass
                
                # OCIO配置文件路径及其依赖
                try:
                    config_file = cmds.colorManagementPrefs(q=True, configFilePath=True)
                    if config_file:
                        color_mgmt["ocio_config"] = config_file
                        
                        # 将OCIO配置文件添加到external_files中
                        result["external_files"].setdefault("color_management", []).append(config_file)
                        
                        # 收集OCIO配置目录中的所有相关文件（LUT等）
                        try:
                            config_dir = os.path.dirname(config_file)
                            if os.path.exists(config_dir):
                                # 收集OCIO配置目录及其子目录中的所有LUT和配置文件
                                ocio_extensions = {'.lut', '.spi1d', '.spi3d', '.cube', '.3dl', 
                                                  '.csp', '.ctf', '.clf', '.cc', '.ccc', '.cdl',
                                                  '.mga', '.m3d', '.ocio', '.xml', '.yaml'}
                                
                                for root, dirs, files in os.walk(config_dir):
                                    for file in files:
                                        file_lower = file.lower()
                                        if any(file_lower.endswith(ext) for ext in ocio_extensions):
                                            file_path = os.path.join(root, file).replace("\\\\", "/")
                                            result["external_files"]["color_management"].append(file_path)
                        except Exception as e:
                            pass
                except:
                    pass
        except:
            color_mgmt["enabled"] = False
        
        # 2. 输出色彩空间（针对不同图像格式）
        try:
            image_format = cmds.getAttr("defaultRenderGlobals.imageFormat")
            # 获取该格式的输出色彩空间
            format_names = {
                0: 'iff', 1: 'soft', 2: 'rla', 3: 'tiff', 4: 'tif',
                5: 'sgi', 6: 'als', 7: 'jpg', 8: 'eps', 9: 'maya',
                10: 'cineon', 11: 'quantel', 19: 'targa', 20: 'bmp',
                31: 'psd', 32: 'png', 35: 'dds', 36: 'psd', 50: 'exr'
            }
            format_name = format_names.get(image_format, 'unknown')
            color_mgmt["output_format"] = format_name
            
            # 尝试获取该格式的色彩空间设置
            try:
                output_space = cmds.colorManagementPrefs(q=True, outputTarget=format_name)
                if output_space:
                    color_mgmt["output_space"] = output_space
            except:
                pass
        except:
            pass
        
        # 3. Arnold特定的色彩设置
        if result["renderer"] == "arnold":
            arnold_color = {}
            try:
                # Arnold Driver的色彩空间
                if cmds.objExists('defaultArnoldDriver'):
                    try:
                        # 色彩管理模式
                        color_manager = cmds.getAttr('defaultArnoldDriver.colorManagement')
                        arnold_color["color_management"] = color_manager
                    except:
                        pass
                    
                    try:
                        # ACES工作流
                        if cmds.attributeQuery('aiTranslator', node='defaultArnoldDriver', exists=True):
                            translator = cmds.getAttr('defaultArnoldDriver.aiTranslator')
                            arnold_color["translator"] = translator
                    except:
                        pass
                
                # Arnold渲染选项的色彩设置
                if cmds.objExists('defaultArnoldRenderOptions'):
                    try:
                        # 色彩管理器
                        if cmds.attributeQuery('color_manager', node='defaultArnoldRenderOptions', exists=True):
                            cm = cmds.getAttr('defaultArnoldRenderOptions.color_manager')
                            arnold_color["color_manager"] = cm
                    except:
                        pass
                
                if arnold_color:
                    color_mgmt["arnold"] = arnold_color
            except:
                pass
        
        # 4. 文件纹理节点的色彩空间（采样几个作为参考）
        try:
            texture_color_spaces = {}
            file_nodes = safe_list(cmds.ls(type='file'))
            
            if file_nodes:
                # 只采样前5个文件节点
                for f_node in file_nodes[:5]:
                    try:
                        if cmds.attributeQuery('colorSpace', node=f_node, exists=True):
                            cs = cmds.getAttr(f"{f_node}.colorSpace")
                            if cs:
                                texture_color_spaces[f_node] = cs
                    except:
                        pass
                
                if texture_color_spaces:
                    color_mgmt["texture_samples"] = texture_color_spaces
        except:
            pass
        
        # 保存到result
        result["project"]["color_management"] = color_mgmt
        
    except Exception as e:
        result["project"]["color_management"] = {"error": str(e)}
    
    # 渲染设置
    try:
        drg = {}
        for attr in ("imageFilePrefix", "startFrame", "endFrame", "byFrameStep", "animation", "imageFormat"):
            try:
                drg[attr] = cmds.getAttr(f"defaultRenderGlobals.{attr}")
            except:
                pass
        result["render_settings"]["defaultRenderGlobals"] = drg
    except:
        pass
    
    # 读取渲染保存路径
    try:
        imageFilePrefix = ""
        outFormatControl = 0
        workspace_images = ""
        
        try:
            imageFilePrefix = cmds.getAttr("defaultRenderGlobals.imageFilePrefix") or ""
        except:
            pass
        
        try:
            outFormatControl = cmds.getAttr("defaultRenderGlobals.outFormatControl")
        except:
            pass
        
        try:
            workspace_root = cmds.workspace(query=True, rootDirectory=True)
            images_dir = cmds.workspace(fileRuleEntry="images")
            if images_dir:
                workspace_images = os.path.join(workspace_root, images_dir).replace("\\\\", "/")
            else:
                workspace_images = workspace_root.replace("\\\\", "/") if workspace_root else ""
        except:
            pass
        
        # 判断是否为绝对路径
        # 只判断 imageFilePrefix 本身，不依赖 workspace
        # 即使后面有 Maya 变量（如 <Scene>），只要前面有绝对路径前缀，就是绝对路径
        is_absolute = False
        if imageFilePrefix:
            # 清理路径，统一使用正斜杠
            prefix_clean = imageFilePrefix.replace("\\\\", "/")
            
            # 1. 检查是否以 Windows 盘符开头（如 C:, D: 等）
            if re.match(r'^[A-Za-z]:', prefix_clean):
                is_absolute = True
            # 2. 检查是否以 UNC 路径开头（\\\\server\\\\share）
            elif prefix_clean.startswith("//") or prefix_clean.startswith("\\\\\\\\"):
                is_absolute = True
            # 3. 转换为 Windows 路径格式，使用 os.path.isabs 判断
            else:
                prefix_win = prefix_clean.replace("/", "\\\\")
                if os.path.isabs(prefix_win):
                    is_absolute = True
        
        result["render_path"]["imageFilePrefix"] = imageFilePrefix
        result["render_path"]["is_absolute"] = is_absolute
        result["render_path"]["outFormatControl"] = outFormatControl
        result["render_path"]["workspace_images"] = workspace_images
    except Exception as e:
        pass
    
    try:
        dres = {}
        for attr in ("width", "height"):
            try:
                dres[attr] = cmds.getAttr(f"defaultResolution.{attr}")
            except:
                pass
        result["render_settings"]["defaultResolution"] = dres
    except:
        pass
    
    # 渲染相机
    try:
        render_cameras = []
        all_cams = safe_list(cmds.ls(type='camera'))
        for cam in all_cams:
            try:
                if cmds.getAttr(f"{cam}.renderable"):
                    cam_transform = cmds.listRelatives(cam, parent=True, fullPath=False)
                    if cam_transform:
                        render_cameras.append(cam_transform[0])
            except:
                pass
        result["render_settings"]["render_cameras"] = render_cameras
    except:
        pass
    
    # 渲染设备（CPU/GPU）
    try:
        render_device = None
        renderer_name = result.get("renderer", "").lower()
        
        # Arnold 渲染器
        if renderer_name == "arnold":
            if cmds.objExists('defaultArnoldRenderOptions'):
                try:
                    if cmds.attributeQuery('renderDevice', node='defaultArnoldRenderOptions', exists=True):
                        device_value = cmds.getAttr('defaultArnoldRenderOptions.renderDevice')
                        if device_value == 0:
                            render_device = "cpu"
                        elif device_value == 1:
                            render_device = "gpu"
                except:
                    pass
        
        # Redshift 渲染器
        elif renderer_name == "redshift":
            if cmds.objExists('redshiftOptions'):
                try:
                    if cmds.attributeQuery('renderUsing', node='redshiftOptions', exists=True):
                        device_value = cmds.getAttr('redshiftOptions.renderUsing')
                        if device_value == 0:
                            render_device = "gpu"
                        elif device_value == 1:
                            render_device = "cpu"
                except:
                    pass
        
        # V-Ray 渲染器
        elif renderer_name == "vray":
            if cmds.objExists('vraySettings'):
                try:
                    if cmds.attributeQuery('vrayVfbRenderDevice', node='vraySettings', exists=True):
                        device_value = cmds.getAttr('vraySettings.vrayVfbRenderDevice')
                        if device_value == 0:
                            render_device = "cpu"
                        elif device_value == 1:
                            render_device = "gpu"
                except:
                    pass
        
        result["render_settings"]["render_device"] = render_device
    except:
        pass
    
    if out_json:
        with open(out_json, 'w', encoding='utf-8') as f:
            f.write(json.dumps(result, ensure_ascii=False))
    else:
        print(json.dumps(result, ensure_ascii=False))
except Exception as e:
    payload = {"error": str(e), "scene_file": scene_path}
    if out_json:
        with open(out_json, 'w', encoding='utf-8') as f:
            f.write(json.dumps(payload, ensure_ascii=False))
    else:
        print(json.dumps(payload, ensure_ascii=False))
finally:
    try:
        maya.standalone.uninitialize()
    except:
        pass
'''


def run_maya_script(mayapy_path: str, scene_path: str) -> Dict[str, Any]:
    """使用指定mayapy执行检查脚本并返回字典结果"""
    if not os.path.exists(mayapy_path):
        raise FileNotFoundError(f"mayapy 不存在: {mayapy_path}")
    if not os.path.exists(scene_path):
        raise FileNotFoundError(f"场景文件不存在: {scene_path}")

    script_content = _generate_mayapy_inspect_script()
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as temp_file:
        temp_file.write(script_content)
        temp_script_path = temp_file.name

    try:
        output_file_descriptor, output_json_path = tempfile.mkstemp(suffix='.json')
        os.close(output_file_descriptor)
        process = subprocess.run(
            [mayapy_path, temp_script_path, scene_path, output_json_path],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='ignore',
            timeout=300
        )
        if os.path.exists(output_json_path) and os.path.getsize(output_json_path) > 0:
            with open(output_json_path, 'r', encoding='utf-8') as f:
                scene_data = json.load(f)
        else:
            stdout = (process.stdout or '').strip()
            try:
                scene_data = json.loads(stdout)
            except Exception:
                raise RuntimeError(f"未获得有效JSON输出。stderr: {process.stderr}")
        
        # 输出渲染路径信息到控制台
        render_path_info = scene_data.get('render_path') or {}
        if render_path_info:
            image_file_prefix = render_path_info.get('imageFilePrefix', '')
            is_absolute = render_path_info.get('is_absolute', False)
            out_format_control = render_path_info.get('outFormatControl', 0)
            # workspace_images = render_path_info.get('workspace_images', '')
            
            logger.print_with_time("=" * 70)
            logger.print_with_time("渲染路径信息")
            logger.print_with_time("=" * 70)
            logger.print_with_time(f"场景文件: {scene_path}")
            logger.print_with_time(f"imageFilePrefix: {image_file_prefix if image_file_prefix else '(空)'}")
            if image_file_prefix:
                path_type = '绝对路径' if is_absolute else '相对路径'
                logger.print_with_time(f"路径类型: {path_type}")
            else:
                logger.print_with_time(f"路径类型: 未设置")
            logger.print_with_time(f"outFormatControl: {out_format_control}")
            logger.print_with_time("=" * 70)
        
        return scene_data
    finally:
        try:
            os.unlink(temp_script_path)
        except:
            pass
        try:
            if 'output_json_path' in locals() and os.path.exists(output_json_path):
                os.unlink(output_json_path)
        except:
            pass


def _resolve_mayabatch_from_mayapy(mayapy_path: str) -> str:
    """从mayapy路径解析mayabatch路径"""
    mayapy_dir = os.path.dirname(mayapy_path)
    mayabatch_path = os.path.join(mayapy_dir, 'mayabatch.exe')
    if os.path.exists(mayabatch_path):
        return mayabatch_path
    raise FileNotFoundError(f"未找到mayabatch.exe: {mayabatch_path}")


def convert_mb_to_ma(mayapy_path: str, mb_path: str, ma_path: str) -> bool:
    """使用 mayabatch 将 MB 转 MA（保留引用/贴图/未知节点，禁用脚本节点）"""
    logger.print_with_time(f"转换MB到MA: {os.path.basename(mb_path)} -> {os.path.basename(ma_path)}")

    if not os.path.exists(mb_path):
        logger.print_with_time(f"错误: MB文件不存在: {mb_path}")
        return False

    ma_dir = os.path.dirname(ma_path)
    if ma_dir:
        os.makedirs(ma_dir, exist_ok=True)

    # 解析 mayabatch
    try:
        mayabatch_path = _resolve_mayabatch_from_mayapy(mayapy_path)
    except FileNotFoundError:
        logger.print_with_time("错误: 未找到mayabatch.exe")
        return False

    # 选择 workspace：优先最近的 workspace.mel，其次场景目录
    def _find_workspace_root(start_file: str) -> str:
        d = os.path.abspath(os.path.dirname(start_file))
        last = None
        while d and d != last:
            if os.path.isfile(os.path.join(d, "workspace.mel")):
                return d
            last, d = d, os.path.dirname(d)
        return os.path.abspath(os.path.dirname(start_file))

    workspace_root = _find_workspace_root(mb_path)

    # Maya 接受的正斜杠路径
    mb_file_maya = normalize_path_separators(os.path.abspath(mb_path))
    ma_file_maya = normalize_path_separators(os.path.abspath(ma_path))
    ws_dir_maya = normalize_path_separators(workspace_root)

    # MEL 命令串：
    # 1) 新场景；2) 设置 workspace；3) 显式打开（禁脚本节点、加载所有引用、忽略版本、无交互）
    # 4) 尝试恢复 unknownPlugin（若本机有插件则还原插件节点）；5) 轻刷 file 节点（可选）
    # 6) 重命名并 ASCII 保存（保留引用）
    mel_script = f'''
file -f -new;
catch(`workspace -o "{ws_dir_maya}"`);
catch(`workspace -fr "images" "images"`);

// 打开文件：使用标准MEL语法
// -f: force (强制)
// -o: open
// -ignoreVersion: 忽略版本检查（标志，不需要值）
// -esn off: 禁用脚本节点执行
// -lrd "all": 加载所有引用深度
// -prompt off: 禁用交互提示
file -f -o -ignoreVersion -esn off -lrd "all" -prompt off "{mb_file_maya}";

// 尝试恢复未知插件（如果插件可用）
if (`exists unknownPlugin`) {{
    string $plugs[] = `unknownPlugin -q -list`;
    for ($p in $plugs) {{
        // 尝试加载插件
        if (!`pluginInfo -q -l $p`) {{
            catch(`loadPlugin -quiet $p`);
        }}
    }}
}}

// 删除所有未知节点（unknown 类型），这是阻止格式转换的主要原因
// 注意：即使在尝试恢复插件后，未知节点仍可能阻止格式转换
string $unknownNodes[] = `ls -type "unknown"`;
if (size($unknownNodes) > 0) {{
    print("发现 " + size($unknownNodes) + " 个未知节点，正在删除...\\n");
    // 直接删除所有未知节点，因为它们会阻止格式转换
    for ($node in $unknownNodes) {{
        catch(`delete $node`);
    }}
    print("已删除 " + size($unknownNodes) + " 个未知节点\\n");
}}

// 轻刷标准 file 纹理节点，确保 fileTextureName 显式写入
string $fileNodes[] = `ls -type "file"`;
for ($node in $fileNodes) {{
    if (`objExists ($node + ".fileTextureName")`) {{
        string $texPath = `getAttr ($node + ".fileTextureName")`;
        if ($texPath != "") {{
            setAttr -type "string" ($node + ".fileTextureName") $texPath;
        }}
    }}
}}

file -rename "{ma_file_maya}";
file -type "mayaAscii";
file -save -f -preserveReferences;
'''

    cmd = [mayabatch_path, '-command', mel_script]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='ignore',
            timeout=1200  # 放宽时间
        )

        exit_code = proc.returncode

        if os.path.exists(ma_path):
            file_size = os.path.getsize(ma_path)
            if file_size > 0:
                logger.print_with_time(f"MB转换MA成功: {os.path.basename(ma_path)}")
                logger.print_with_time(f"输出文件大小: {file_size / 1024:.2f} KB")
                return True

            logger.print_with_time("MB转换MA失败: 输出文件为空")
            if exit_code != 0:
                logger.print_with_time(f"mayabatch退出码: {exit_code}")
            return False

        logger.print_with_time("MB转换MA失败: 输出文件不存在")
        logger.print_with_time(f"mayabatch退出码: {exit_code}")
        if proc.stdout:
            logger.print_with_time("最后输出(末尾若干行):")
            for line in (proc.stdout.splitlines()[-20:]):
                if line.strip():
                    logger.print_with_time(f"  {line.strip()}")
        if proc.stderr:
            logger.print_with_time("标准错误输出(末尾若干行):")
            for line in (proc.stderr.splitlines()[-20:]):
                if line.strip():
                    logger.print_with_time(f"  {line.strip()}")
        logger.print_with_time(f"执行的命令: {' '.join(cmd)}")
        return False

    except subprocess.TimeoutExpired:
        logger.print_with_time("MB转换MA失败: 超时（1200秒）")
        return False
    except Exception as e:
        logger.print_with_time(f"MB转换MA失败: {str(e)}")
        logger.print_with_time(f"异常详情: {traceback.format_exc()}")
        return False

def convert_ma_to_mb(mayapy_path: str, ma_path: str, mb_path: str) -> bool:
    """使用mayabatch将MA文件转换为MB文件（保持引用和贴图）
    
    使用mayabatch.exe，这是Maya官方推荐的批处理工具，
    提供完整的Maya环境（插件、workspace、渲染器等），
    与GUI Maya几乎一致，结果与界面"另存为"完全一致。
    
    Args:
        mayapy_path: mayapy路径（用于解析mayabatch路径）
        ma_path: MA文件路径
        mb_path: 输出的MB文件路径
        
    Returns:
        是否转换成功
    """
    logger.print_with_time(f"转换MA到MB: {os.path.basename(ma_path)}")
    
    # 验证输入文件存在
    if not os.path.exists(ma_path):
        logger.print_with_time(f"错误: MA文件不存在: {ma_path}")
        return False
    
    # 确保输出目录存在
    mb_dir = os.path.dirname(mb_path)
    if mb_dir:
        os.makedirs(mb_dir, exist_ok=True)
    
    # 解析mayabatch路径
    try:
        mayabatch_path = _resolve_mayabatch_from_mayapy(mayapy_path)
    except FileNotFoundError:
        logger.print_with_time(f"错误: 未找到mayabatch.exe")
        return False
    
    # 转换路径为Maya格式（使用正斜杠）
    ma_file_maya = normalize_path_separators(ma_path)
    mb_file_maya = normalize_path_separators(mb_path)
    
    # 构建MEL命令
    # 关键：在删除未知节点前，先确保所有文件纹理节点的路径被保存
    # 1. 打开文件后，先刷新所有文件纹理节点
    # 2. 删除未知节点（如果有）
    # 3. file -rename 设置新文件名
    # 4. file -type 设置文件类型
    # 5. file -save -force 保存文件（使用preserveReferences确保引用不丢失）
    mel_command = f'''
// 刷新所有文件纹理节点，确保路径信息被保存
string $fileNodes[] = `ls -type "file"`;
for ($node in $fileNodes) {{
    string $texPath = `getAttr ($node + ".fileTextureName")`;
    if ($texPath != "") {{
        setAttr -type "string" ($node + ".fileTextureName") $texPath;
    }}
}}

// 删除未知节点（只删除真正阻止格式转换的节点）
string $unknownNodes[] = `ls -type "unknown"`;
if (size($unknownNodes) > 0) {{
    print("发现 " + size($unknownNodes) + " 个未知节点，正在删除...\\n");
    // 检查未知节点是否与文件纹理节点有关联
    for ($node in $unknownNodes) {{
        // 如果未知节点不是文件纹理节点的依赖，才删除
        string $connections[] = `listConnections -s 1 -d 0 $node`;
        int $isConnected = 0;
        for ($conn in $connections) {{
            if (`nodeType $conn` == "file") {{
                $isConnected = 1;
                break;
            }}
        }}
        if (!$isConnected) {{
            delete $node;
        }}
    }}
}}

file -rename "{mb_file_maya}";
file -type "mayaBinary";
file -save -force -preserveReferences;
'''
    
    # 构建mayabatch命令
    # mayabatch -file "源文件" -command "MEL命令"
    cmd = [
        mayabatch_path,
        '-file', ma_file_maya,
        '-command', mel_command
    ]
    
    try:
        # 执行mayabatch命令
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='ignore',
            timeout=300
        )
        
        # 检查退出码
        exit_code = proc.returncode
        
        # 检查输出文件是否存在
        if os.path.exists(mb_path):
            file_size = os.path.getsize(mb_path)
            if file_size > 0:
                logger.print_with_time(f"MA转换MB成功: {os.path.basename(mb_path)}")
                logger.print_with_time(f"输出文件大小: {file_size / 1024:.2f} KB")
                
                # 获取原始文件大小用于对比
                original_size = os.path.getsize(ma_path)
                if file_size < original_size * 0.3:
                    logger.print_with_time("警告: 转换后文件大小明显小于原始文件，可能丢失了数据")
                
                return True
            else:
                logger.print_with_time("MA转换MB失败: 输出文件为空")
                if exit_code != 0:
                    logger.print_with_time(f"mayabatch退出码: {exit_code}")
                return False
        else:
            # 输出文件不存在，显示详细错误信息
            logger.print_with_time(f"MA转换MB失败: 输出文件不存在")
            logger.print_with_time(f"mayabatch退出码: {exit_code}")
            
            # 输出完整的stdout和stderr
            if proc.stdout:
                stdout_lines = proc.stdout.split('\n')
                # 过滤掉常规的日志信息，只显示错误和警告
                error_lines = []
                for line in stdout_lines:
                    line_stripped = line.strip()
                    if line_stripped:
                        # 显示包含ERROR、Error、WARNING、Warning、失败等关键词的行
                        if any(keyword in line_stripped for keyword in ['ERROR', 'Error', 'WARNING', 'Warning', '失败', 'Exception', 'Traceback']):
                            error_lines.append(line_stripped)
                        # 或者显示最后10行（通常是错误信息）
                        elif len(error_lines) < 10 and len(stdout_lines) - stdout_lines.index(line) <= 10:
                            error_lines.append(line_stripped)
                
                if error_lines:
                    logger.print_with_time("错误信息:")
                    for line in error_lines[:20]:  # 最多显示20行
                        logger.print_with_time(f"  {line}")
                else:
                    # 如果没有明显的错误行，显示最后10行
                    logger.print_with_time("最后输出:")
                    for line in stdout_lines[-10:]:
                        if line.strip():
                            logger.print_with_time(f"  {line.strip()}")
            
            if proc.stderr:
                stderr_lines = proc.stderr.split('\n')
                error_stderr_lines = [line.strip() for line in stderr_lines if line.strip() and not line.strip().startswith('00:00')]
                if error_stderr_lines:
                    logger.print_with_time("标准错误输出:")
                    for line in error_stderr_lines[:20]:
                        logger.print_with_time(f"  {line}")
            
            # 显示执行的命令（用于调试）
            logger.print_with_time(f"执行的命令: {' '.join(cmd)}")
            
            return False
            
    except subprocess.TimeoutExpired:
        logger.print_with_time("MA转换MB失败: 超时（300秒）")
        return False
    except Exception as e:
        logger.print_with_time(f"MA转换MB失败: {str(e)}")
        logger.print_with_time(f"异常详情: {traceback.format_exc()}")
        return False


def get_ma_render_path_from_file(ma_file_path: str) -> Tuple[Optional[str], bool]:
    """
    直接从MA文件中读取渲染保存路径
    
    Args:
        ma_file_path: MA文件路径
        
    Returns:
        (image_file_prefix, is_absolute) 元组
        image_file_prefix: 渲染路径，如果未找到则返回None
        is_absolute: 是否为绝对路径
    """
    if not os.path.exists(ma_file_path):
        return None, False
    
    if not ma_file_path.lower().endswith('.ma'):
        return None, False
    
    try:
        with open(ma_file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        # 匹配 imageFilePrefix 设置行
        # MA文件格式示例:
        # setAttr ".ifp" -type "string" "C:/path/to/render";
        # setAttr ".imageFilePrefix" -type "string" "C:/path/to/render";
        patterns = [
            r'setAttr\s+"\.(?:ifp|imageFilePrefix)"\s+-type\s+"string"\s+"([^"]+)"',
            r'setAttr\s+"\.(?:ifp|imageFilePrefix)"\s+-type\s+"string"\s+"([^"]+)"\s*;',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, content)
            if match:
                image_file_prefix = match.group(1).strip()
                if image_file_prefix:
                    # 判断是否是绝对路径
                    # Windows绝对路径: C:/ 或 C:\ 开头
                    # Unix绝对路径: / 开头
                    normalized_path = normalize_path_separators(image_file_prefix)
                    is_absolute = (
                        (len(normalized_path) >= 2 and normalized_path[1] == ':' and normalized_path[0].isalpha()) or  # Windows: C:/
                        normalized_path.startswith('/')  # Unix: /
                    )
                    return image_file_prefix, is_absolute
        
        return None, False
    except Exception as e:
        logger.print_with_time(f"读取MA文件失败: {e}")
        return None, False


def fix_ma_render_path(scene_path: str, mayapy_path: str, is_absolute: bool, image_file_prefix: str) -> bool:
    """修改MA文件中的绝对路径为相对路径（通过直接文本编辑，不通过Maya API保存）
    
    使用文本解析方式直接修改MA文件，避免通过Maya API保存导致的信息丢失。
    只修改渲染路径相关的行，其他内容保持不变。
    
    Args:
        scene_path: MA文件路径
        mayapy_path: mayapy路径（未使用，保留以兼容接口）
        is_absolute: 是否为绝对路径
        image_file_prefix: 当前的imageFilePrefix值
        
    Returns:
        是否修改成功
    """
    if not is_absolute or not image_file_prefix:
        return False
    
    if not scene_path.lower().endswith('.ma'):
        logger.print_with_time("警告: 不是MA文件，跳过修改")
        return False
    
    logger.print_with_time("修改MA文件中的绝对路径为相对路径（文本编辑模式）...")
    
    # 将绝对路径转换为相对路径
    # 获取场景文件所在目录作为基准
    scene_dir = os.path.dirname(os.path.abspath(scene_path))
    scene_dir_normalized = normalize_path_separators(scene_dir)
    
    # 将image_file_prefix转换为相对路径
    prefix_normalized = normalize_path_separators(image_file_prefix)
    
    # 如果前缀包含场景目录，则提取相对部分
    if prefix_normalized.startswith(scene_dir_normalized):
        relative_path = prefix_normalized[len(scene_dir_normalized):].lstrip('/')
        new_prefix = relative_path
    else:
        # 如果无法确定相对路径，使用默认前缀
        new_prefix = "<Scene>/<RenderLayer>"
    
    try:
        # 读取MA文件内容
        with open(scene_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        
        # 查找并替换渲染路径相关的行
        modified = False
        new_lines = []
        
        for line in lines:
            # 匹配 imageFilePrefix 设置行
            # MA文件格式示例:
            # setAttr ".ifp" -type "string" "C:/path/to/render";
            # setAttr ".imageFilePrefix" -type "string" "C:/path/to/render";
            # setAttr ".ifp" -type "string" "C:/path/to/render" ;
            if '.ifp' in line or '.imageFilePrefix' in line:
                # 匹配多种可能的格式
                # 匹配格式: setAttr ".ifp" -type "string" "原路径值";
                patterns = [
                    r'(setAttr\s+"\.(?:ifp|imageFilePrefix)"\s+-type\s+"string"\s+")[^"]*(";)',
                    r'(setAttr\s+"\.(?:ifp|imageFilePrefix)"\s+-type\s+"string"\s+")[^"]*("\s*;)',
                    r'(setAttr\s+"\.(?:ifp|imageFilePrefix)"\s+-type\s+"string"\s+")[^"]*(")',
                ]
                
                matched = False
                for pattern in patterns:
                    match = re.search(pattern, line)
                    if match:
                        # 替换为新路径
                        new_line = match.group(1) + new_prefix + match.group(2)
                        if not new_line.endswith('\n'):
                            new_line += '\n'
                        new_lines.append(new_line)
                        modified = True
                        logger.print_with_time(f"修改行: {line.rstrip()}")
                        logger.print_with_time(f"   -> {new_line.rstrip()}")
                        matched = True
                        break
                
                if not matched:
                    new_lines.append(line)
            
            # 匹配 outFormatControl 设置行（确保设为0）
            elif '.ofc' in line or '.outFormatControl' in line:
                # 确保 outFormatControl 为 0
                # 格式: setAttr ".ofc" -type "long" 1;
                patterns = [
                    r'(setAttr\s+"\.(?:ofc|outFormatControl)"\s+-type\s+"long"\s+)\d+(\s*;)',
                    r'(setAttr\s+"\.(?:ofc|outFormatControl)"\s+-type\s+"long"\s+)\d+(\s*$)',  # 行尾可能没有分号
                ]
                
                matched = False
                for pattern in patterns:
                    match = re.search(pattern, line)
                    if match:
                        new_line = match.group(1) + '0'
                        if len(match.groups()) > 1:
                            new_line += match.group(2)
                        if not new_line.endswith('\n'):
                            new_line += '\n'
                        if new_line != line:
                            new_lines.append(new_line)
                            modified = True
                            logger.print_with_time(f"修改 outFormatControl: {line.rstrip()}")
                            matched = True
                            break
                
                if not matched:
                    new_lines.append(line)
            else:
                # 保持其他所有行不变（包括贴图路径、引用等所有其他信息）
                new_lines.append(line)
        
        if not modified:
            logger.print_with_time("警告: 未找到需要修改的行，可能文件格式不同")
            return False
        
        # 写入修改后的内容
        with open(scene_path, 'w', encoding='utf-8', errors='ignore') as f:
            f.writelines(new_lines)
        
        logger.print_with_time(f"路径已修改为: {new_prefix}")
        logger.print_with_time("MA文件已更新（文本编辑模式，其他内容保持不变）")
        return True
        
    except Exception as e:
        logger.print_with_time(f"修改异常: {e}")
        traceback.print_exc()
        
        return False

