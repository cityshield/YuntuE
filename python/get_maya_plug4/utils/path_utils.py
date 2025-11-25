#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
路径工具模块
提供路径标准化等工具函数
"""


def normalize_path_separators(path: str) -> str:
    """规范化路径分隔符：统一为正斜杠，去除所有双斜杠和多斜杠
    
    处理各种路径格式：
    - 反斜杠转正斜杠：C:\\path\\file -> C:/path/file
    - 多个反斜杠转正斜杠：C:\\\\path -> C://path -> C:/path
    - 双斜杠转单斜杠：C://path//file -> C:/path/file
    - 多个连续斜杠转单斜杠：C://///path -> C:/path
    """
    if not path:
        return path
    # 1. 统一为正斜杠（所有反斜杠转正斜杠）
    normalized = path.replace('\\', '/')
    # 2. 去除所有双斜杠和多斜杠（循环处理直到没有连续斜杠）
    while '//' in normalized:
        normalized = normalized.replace('//', '/')
    return normalized

