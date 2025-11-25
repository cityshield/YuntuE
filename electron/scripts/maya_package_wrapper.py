#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Maya 打包包装脚本 - 供 Electron 调用
直接使用 MayaSceneProcessor，类似 main.py 的示例
"""

import sys
import json
import os
import tempfile
import shutil
from pathlib import Path

# 确保标准输出和错误输出使用 UTF-8 编码（修复 Windows 中文乱码）
if sys.platform == 'win32':
    import io
    # 重新配置 stdout 和 stderr 为 UTF-8 编码
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
    # 对于 Python 3.7+，使用 io.TextIOWrapper
    if not hasattr(sys.stdout, 'reconfigure'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    if not hasattr(sys.stderr, 'reconfigure'):
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 添加 get_maya_plug4 到 Python 路径
# 支持开发环境、生产环境和 PyInstaller 打包环境
script_file = Path(__file__).resolve()

# 检测是否在 PyInstaller 打包环境中运行
# PyInstaller 会在 sys 中添加 _MEIPASS 属性，指向临时解压目录
is_pyinstaller = getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')

get_maya_plug4_path = None
python_dir_to_add = None

if is_pyinstaller:
    # PyInstaller 打包环境：数据文件在临时解压目录中
    # 数据文件通过 --add-data 添加，路径为 get_maya_plug4_obfuscated
    meipass = Path(sys._MEIPASS)
    
    # PyInstaller 打包后的路径结构：get_maya_plug4_obfuscated/get_maya_plug4/...
    # 尝试查找混淆后的代码（优先）
    obfuscated_dir = meipass / 'get_maya_plug4_obfuscated'
    if obfuscated_dir.exists():
        # 查找 get_maya_plug4 子目录
        get_maya_plug4_in_obfuscated = obfuscated_dir / 'get_maya_plug4'
        if get_maya_plug4_in_obfuscated.exists() and (get_maya_plug4_in_obfuscated / 'core').exists():
            get_maya_plug4_path = get_maya_plug4_in_obfuscated
            python_dir_to_add = obfuscated_dir
        else:
            # 如果没有 get_maya_plug4 子目录，直接在 obfuscated_dir 中查找 core 目录
            if (obfuscated_dir / 'core').exists():
                get_maya_plug4_path = obfuscated_dir
                python_dir_to_add = meipass
            else:
                # 遍历 obfuscated_dir 查找包含 core 的子目录
                for item in obfuscated_dir.iterdir():
                    if item.is_dir() and (item / 'core').exists():
                        get_maya_plug4_path = item
                        python_dir_to_add = obfuscated_dir
                        break
    
    # 如果还是找不到，尝试在 meipass 根目录直接查找 get_maya_plug4
    if not get_maya_plug4_path:
        direct_path = meipass / 'get_maya_plug4'
        if direct_path.exists() and (direct_path / 'core').exists():
            get_maya_plug4_path = direct_path
            python_dir_to_add = meipass
else:
    # 非 PyInstaller 环境：开发环境或生产环境
    # 开发环境路径：从 electron/scripts/ 向上三级到项目根目录
    # electron/scripts/ -> electron/ -> 项目根目录/
    dev_project_root = script_file.parent.parent.parent
    dev_get_maya_plug4 = dev_project_root / 'python' / 'get_maya_plug4'
    dev_python_dir = dev_project_root / 'python'

    # 生产环境路径：从 resources/scripts/ 向上两级到 resources/
    # resources/scripts/ -> resources/
    resources_dir = script_file.parent.parent
    resources_get_maya_plug4 = resources_dir / 'python' / 'get_maya_plug4'
    resources_python_dir = resources_dir / 'python'

    if dev_get_maya_plug4.exists():
        get_maya_plug4_path = dev_get_maya_plug4
        python_dir_to_add = dev_python_dir
    elif resources_get_maya_plug4.exists():
        get_maya_plug4_path = resources_get_maya_plug4
        python_dir_to_add = resources_python_dir
    else:
        # 回退：尝试当前工作目录
        cwd = Path.cwd()
        cwd_get_maya_plug4 = cwd / 'python' / 'get_maya_plug4'
        if cwd_get_maya_plug4.exists():
            get_maya_plug4_path = cwd_get_maya_plug4
            python_dir_to_add = cwd / 'python'
        else:
            # 最后尝试：直接在当前目录查找（兼容旧结构）
            cwd_direct = cwd / 'get_maya_plug4'
            if cwd_direct.exists():
                get_maya_plug4_path = cwd_direct
                python_dir_to_add = cwd

# 将 get_maya_plug4 目录添加到 sys.path（因为内部使用相对导入）
if get_maya_plug4_path and get_maya_plug4_path.exists():
    get_maya_plug4_str = str(get_maya_plug4_path)
    if get_maya_plug4_str not in sys.path:
        sys.path.insert(0, get_maya_plug4_str)
    
    # 如果 python_dir_to_add 存在，也添加到 sys.path（用于查找其他模块）
    if python_dir_to_add and python_dir_to_add.exists():
        python_dir_str = str(python_dir_to_add)
        if python_dir_str not in sys.path:
            sys.path.insert(0, python_dir_str)
else:
    # 如果找不到 get_maya_plug4，输出错误信息
    error_msg = f'未找到 get_maya_plug4 目录。尝试的路径：\n'
    if is_pyinstaller:
        error_msg += f'  PyInstaller 临时目录: {sys._MEIPASS}\n'
        meipass = Path(sys._MEIPASS)
        error_msg += f'  混淆代码路径: {meipass / "get_maya_plug4_obfuscated"}\n'
        error_msg += f'  混淆代码+子目录路径: {meipass / "get_maya_plug4_obfuscated" / "get_maya_plug4"}\n'
        # 列出 meipass 目录内容以便调试
        if meipass.exists():
            try:
                items = list(meipass.iterdir())
                error_msg += f'  临时目录内容 ({len(items)} 项): {[item.name for item in items[:10]]}\n'
            except:
                pass
        # 检查 obfuscated 目录
        obfuscated_dir = meipass / 'get_maya_plug4_obfuscated'
        if obfuscated_dir.exists():
            try:
                obfuscated_items = list(obfuscated_dir.iterdir())
                error_msg += f'  混淆目录内容 ({len(obfuscated_items)} 项): {[item.name for item in obfuscated_items[:10]]}\n'
            except:
                pass
    else:
        error_msg += f'  开发环境: {dev_get_maya_plug4 if "dev_get_maya_plug4" in locals() else "N/A"}\n'
        error_msg += f'  生产环境: {resources_get_maya_plug4 if "resources_get_maya_plug4" in locals() else "N/A"}\n'
    error_msg += f'  脚本父目录: {script_file.parent}\n'
    error_msg += f'  脚本父父目录: {script_file.parent.parent}\n'
    error_msg += f'  当前工作目录: {Path.cwd()}\n'
    error_msg += f'  脚本位置: {script_file}'
    print(json.dumps({'error': error_msg}), file=sys.stderr)
    sys.exit(1)

# 导入 get_maya_plug4 模块（get_maya_plug4 目录已在 sys.path 中）
try:
    from core.processor import MayaSceneProcessor
    from core.logger import Logger, LogLevel
except ImportError as e:
    error_msg = f'导入 get_maya_plug4 模块失败: {e}\n'
    error_msg += f'  请确保已安装依赖包。在 conda 环境中运行：\n'
    error_msg += f'  conda install -c conda-forge xxhash\n'
    error_msg += f'  或者使用 pip：\n'
    error_msg += f'  pip install xxhash\n'
    error_msg += f'  sys.path: {sys.path[:3]}...\n'
    error_msg += f'  get_maya_plug4 路径: {get_maya_plug4_path}'
    print(json.dumps({'error': error_msg}), file=sys.stderr)
    sys.exit(1)

# 导入依赖统计函数（从 cli.py 复制逻辑）
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


def _categorize_dependency(path: str) -> str:
    """分类依赖文件类型"""
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


def _compute_dependency_stats(upload_json_path: str) -> dict:
    """计算依赖统计信息（与 CLI 保持一致）"""
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


def main():
    """主函数：从 JSON 输入读取参数，执行打包，输出 JSON 结果"""
    # 重定向 stderr 到日志文件，避免干扰 JSON 输出
    # 注意：这里不能完全重定向，因为 Logger 可能需要 stderr
    # 但我们可以确保只输出 JSON 到 stdout
    try:
        # 从标准输入读取 JSON 参数
        stdin_content = sys.stdin.read()
        if not stdin_content:
            result = {'error': '未收到输入数据'}
            print(json.dumps(result, ensure_ascii=False))
            sys.exit(1)
        input_data = json.loads(stdin_content)
        
        scene_path = input_data.get('scene')
        server_root = input_data.get('serverRoot', '')
        temp_work_dir = input_data.get('tempWorkDir')  # 临时工作目录
        
        if not scene_path:
            result = {'error': '缺少 scene 参数'}
            print(json.dumps(result, ensure_ascii=False))
            sys.exit(1)
        
        if not os.path.exists(scene_path):
            result = {'error': f'场景文件不存在: {scene_path}'}
            print(json.dumps(result, ensure_ascii=False))
            sys.exit(1)
        
        # 如果没有提供临时工作目录，创建一个
        if not temp_work_dir:
            temp_work_dir = tempfile.mkdtemp(prefix='yuntu_maya_package_')
        else:
            os.makedirs(temp_work_dir, exist_ok=True)
        
        # 配置日志（同时输出到 stderr 和文件，stderr 用于实时显示，文件用于保存）
        log_file = os.path.join(temp_work_dir, 'package.log')
        # 创建一个自定义 Logger，输出到 stderr（用于实时显示）
        class StderrLogger(Logger):
            """输出到 stderr 的 Logger，用于实时显示"""
            def _write_to_console(self, formatted_message: str) -> None:
                # 输出到 stderr，这样不会干扰 JSON 输出到 stdout
                print(formatted_message, file=sys.stderr, flush=True)
        
        logger = StderrLogger(
            log_file=log_file,
            console_output=True,  # 输出到 stderr（实时显示）
            file_output=True,     # 同时保存到文件
            log_level=LogLevel.INFO,
            append_mode=False
        )
        
        try:
            # 创建处理器并执行（类似 main.py 的示例）
            processor = MayaSceneProcessor(
                scene_path=scene_path,
                output_dir=temp_work_dir,
                server_root=server_root,
                logger=logger
            )
            processor.process()
            
            # 获取生成的文件路径
            generated_zip = processor.zip_path
            upload_json_path = processor.upload_path
            render_settings_path = processor.render_json_path
            
            # 验证文件是否存在
            if not generated_zip or not os.path.exists(generated_zip):
                result = {'error': '打包失败，未生成 ZIP 文件'}
                print(json.dumps(result, ensure_ascii=False))
                sys.exit(1)
            
            if not upload_json_path or not os.path.exists(upload_json_path):
                result = {'error': 'upload.json 缺失'}
                print(json.dumps(result, ensure_ascii=False))
                sys.exit(1)
            
            if not render_settings_path or not os.path.exists(render_settings_path):
                result = {'error': 'render_settings.json 缺失'}
                print(json.dumps(result, ensure_ascii=False))
                sys.exit(1)
            
            # 计算依赖统计（使用与 CLI 相同的逻辑）
            stats = _compute_dependency_stats(upload_json_path)
            
            # 返回结果
            result = {
                'success': True,
                'zip': generated_zip,
                'zip_name': os.path.basename(generated_zip),
                'upload_json': upload_json_path,
                'render_settings': render_settings_path,
                'server_root': server_root,
                'temp_work_dir': temp_work_dir,
                'log_file': log_file,
                'stats': stats
            }
            
            print(json.dumps(result, ensure_ascii=False))
            sys.exit(0)
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f'打包失败: {error_msg}')
            result = {
                'error': error_msg,
                'log_file': log_file
            }
            print(json.dumps(result, ensure_ascii=False))
            sys.exit(1)
            
    except json.JSONDecodeError as e:
        result = {'error': f'JSON 解析失败: {e}'}
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    except Exception as e:
        result = {'error': f'未知错误: {e}'}
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)


if __name__ == '__main__':
    main()

