#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
主入口程序
根据给定的MB或MA文件，在目标文件夹生成upload.json文件
"""

import sys
import traceback
from core.processor import MayaSceneProcessor
from core.logger import Logger


def main():
    # 配置参数
    scene_path = r"C:\Project\RenderTest\Arnold\MayaProject\wolf_xgen\Wolf\scenes\wolf_fur_refV39.mb"
    # scene_path = r"C:\Project\RenderTest\Arnold\MayaProject\wolf_xgen\Wolf\scenes\wolf_fur_refV39.ma"
    output_dir = r"D:\code\local\get_maya_plug\result\wolf"
    server_root = ""  # 空字符串=简洁路径格式（/C/Project/...）
    
    # 配置日志
    # 选项1: 仅输出到控制台（默认）
    logger = Logger(console_output=True, file_output=False)
    
    # 选项2: 同时输出到控制台和文件
    # log_file = os.path.join(output_dir, "process.log")
    # logger = Logger(
    #     log_file=log_file,
    #     console_output=True,
    #     file_output=True,
    #     log_level=LogLevel.INFO,
    #     append_mode=False  # False=覆盖，True=追加
    # )
    
    # 选项3: 仅输出到文件
    # log_file = os.path.join(output_dir, "process.log")
    # logger = Logger(
    #     log_file=log_file,
    #     console_output=False,
    #     file_output=True
    # )
    
    try:
        # 创建处理器并执行
        processor = MayaSceneProcessor(scene_path, output_dir, server_root, logger=logger)
        processor.process()
    except (FileNotFoundError, ValueError, RuntimeError) as e:
        logger.error(f"错误: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"未知错误: {e}")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

