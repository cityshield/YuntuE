#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Maya 依赖文件扫描器
使用 Maya Python API 精确提取场景文件的所有依赖文件
支持 .ma 和 .mb 格式
"""

import sys
import json
import os

def scan_dependencies(scene_file):
    """
    扫描 Maya 场景文件的所有依赖

    Args:
        scene_file: Maya 场景文件路径 (.ma 或 .mb)

    Returns:
        dict: 依赖文件信息
    """
    try:
        # 导入 Maya 模块
        import maya.standalone
        import maya.cmds as cmds

        # 初始化 Maya standalone
        maya.standalone.initialize()

        dependencies = {
            'textures': [],
            'caches': [],
            'references': [],
            'xgen': [],
            'other': [],
            'success': True,
            'error': None
        }

        try:
            # 打开场景文件（支持 .ma 和 .mb）
            cmds.file(scene_file, open=True, force=True, ignoreVersion=True)

            # 1. 获取所有贴图文件
            file_nodes = cmds.ls(type='file') or []
            for node in file_nodes:
                try:
                    texture_path = cmds.getAttr(node + '.fileTextureName')
                    if texture_path and texture_path.strip():
                        dependencies['textures'].append({
                            'path': texture_path,
                            'node': node
                        })
                except Exception as e:
                    # 忽略单个节点的错误
                    pass

            # 2. 获取所有缓存文件 (cacheFile 节点)
            cache_nodes = cmds.ls(type='cacheFile') or []
            for node in cache_nodes:
                try:
                    cache_path = cmds.getAttr(node + '.cachePath')
                    cache_name = cmds.getAttr(node + '.cacheName')
                    if cache_path and cache_name:
                        full_path = os.path.join(cache_path, cache_name).replace('\\', '/')
                        dependencies['caches'].append({
                            'path': full_path,
                            'node': node,
                            'type': 'cacheFile'
                        })
                except Exception as e:
                    pass

            # 3. 获取 Alembic 缓存
            alembic_nodes = cmds.ls(type='AlembicNode') or []
            for node in alembic_nodes:
                try:
                    # Alembic 节点可能使用 abc_File 或 fn (fileName) 属性
                    abc_file = None
                    try:
                        abc_file = cmds.getAttr(node + '.abc_File')
                    except:
                        try:
                            abc_file = cmds.getAttr(node + '.fn')
                        except:
                            pass

                    if abc_file and abc_file.strip():
                        dependencies['caches'].append({
                            'path': abc_file,
                            'node': node,
                            'type': 'alembic'
                        })
                except Exception as e:
                    pass

            # 4. 获取 GPU 缓存
            gpu_cache_nodes = cmds.ls(type='gpuCache') or []
            for node in gpu_cache_nodes:
                try:
                    # GPU Cache 使用 cacheFileName 属性
                    cache_file = cmds.getAttr(node + '.cacheFileName')
                    if cache_file and cache_file.strip():
                        # 如果是相对路径，尝试获取 cachePath 属性拼接完整路径
                        if not os.path.isabs(cache_file):
                            try:
                                cache_path = cmds.getAttr(node + '.cachePath')
                                if cache_path:
                                    cache_file = os.path.join(cache_path, cache_file).replace('\\', '/')
                            except:
                                pass

                        dependencies['caches'].append({
                            'path': cache_file,
                            'node': node,
                            'type': 'gpuCache'
                        })
                except Exception as e:
                    pass

            # 5. 获取引用文件
            try:
                references = cmds.file(query=True, reference=True) or []
                for ref in references:
                    if ref and ref.strip():
                        dependencies['references'].append({
                            'path': ref
                        })
            except Exception as e:
                pass

            # 6. 获取 XGen 文件
            xgen_nodes = cmds.ls(type='xgmPalette') or []
            for node in xgen_nodes:
                try:
                    xgen_path = cmds.getAttr(node + '.xgDataPath')
                    if xgen_path and xgen_path.strip():
                        dependencies['xgen'].append({
                            'path': xgen_path,
                            'node': node
                        })
                except Exception as e:
                    pass

            # 7. 获取其他可能的文件节点
            # 例如：image planes, audio nodes 等
            image_plane_nodes = cmds.ls(type='imagePlane') or []
            for node in image_plane_nodes:
                try:
                    image_name = cmds.getAttr(node + '.imageName')
                    if image_name and image_name.strip():
                        dependencies['other'].append({
                            'path': image_name,
                            'node': node,
                            'type': 'imagePlane'
                        })
                except Exception as e:
                    pass

            # 8. 获取音频节点
            audio_nodes = cmds.ls(type='audio') or []
            for node in audio_nodes:
                try:
                    audio_file = cmds.getAttr(node + '.filename')
                    if audio_file and audio_file.strip():
                        dependencies['other'].append({
                            'path': audio_file,
                            'node': node,
                            'type': 'audio'
                        })
                except Exception as e:
                    pass

        finally:
            # 清理：关闭 Maya
            maya.standalone.uninitialize()

        # 输出为 JSON
        print(json.dumps(dependencies, indent=2, ensure_ascii=False))
        return 0

    except ImportError as e:
        # Maya 模块导入失败
        error_result = {
            'success': False,
            'error': 'Maya Python API not available: ' + str(e),
            'textures': [],
            'caches': [],
            'references': [],
            'xgen': [],
            'other': []
        }
        print(json.dumps(error_result, indent=2))
        return 1

    except Exception as e:
        # 其他错误
        error_result = {
            'success': False,
            'error': 'Failed to scan dependencies: ' + str(e),
            'textures': [],
            'caches': [],
            'references': [],
            'xgen': [],
            'other': []
        }
        print(json.dumps(error_result, indent=2))
        return 1


if __name__ == '__main__':
    if len(sys.argv) < 2:
        error_result = {
            'success': False,
            'error': 'Usage: mayapy maya_dependency_scanner.py <scene_file>',
            'textures': [],
            'caches': [],
            'references': [],
            'xgen': [],
            'other': []
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)

    scene_file = sys.argv[1]

    if not os.path.exists(scene_file):
        error_result = {
            'success': False,
            'error': f'Scene file not found: {scene_file}',
            'textures': [],
            'caches': [],
            'references': [],
            'xgen': [],
            'other': []
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)

    sys.exit(scan_dependencies(scene_file))
