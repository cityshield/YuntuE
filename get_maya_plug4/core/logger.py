#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
日志管理模块
提供统一的日志输出功能，支持输出到控制台和/或文件
"""

import os
import sys
from datetime import datetime
from typing import Optional
from enum import Enum


class LogLevel(Enum):
    """日志级别"""
    DEBUG = 0
    INFO = 1
    WARNING = 2
    ERROR = 3


class Logger:
    """日志管理器"""
    
    def __init__(
        self,
        log_file: Optional[str] = None,
        console_output: bool = True,
        file_output: bool = False,
        log_level: LogLevel = LogLevel.INFO,
        append_mode: bool = True
    ):
        """
        初始化日志管理器
        
        Args:
            log_file: 日志文件路径（如果为None且file_output=True，则自动生成）
            console_output: 是否输出到控制台
            file_output: 是否输出到文件
            log_level: 日志级别（只输出大于等于此级别的日志）
            append_mode: 文件追加模式（True=追加，False=覆盖）
        """
        self.console_output = console_output
        self.file_output = file_output
        self.log_level = log_level
        self.append_mode = append_mode
        
        # 日志目录及文件状态
        self._log_dir: Optional[str] = None
        self._current_day: Optional[str] = None
        self.log_file: Optional[str] = None

        if self.file_output:
            self._configure_log_directory(log_file)
    
    def _format_message(self, message: str, level: LogLevel) -> str:
        """格式化日志消息"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        level_name = level.name
        return f"[{timestamp}] [{level_name}] {message}"
    
    def _should_log(self, level: LogLevel) -> bool:
        """判断是否应该输出此级别的日志"""
        return level.value >= self.log_level.value
    
    def _write_to_console(self, formatted_message: str) -> None:
        """输出到控制台"""
        print(formatted_message)
        sys.stdout.flush()
    
    def _write_to_file(self, formatted_message: str) -> None:
        """输出到文件"""
        if not self.file_output:
            return
        
        self._ensure_daily_log_file()
        
        if self.log_file:
            try:
                with open(self.log_file, 'a', encoding='utf-8') as f:
                    f.write(formatted_message + '\n')
            except Exception as e:
                print(f"写入日志文件失败: {e}")
    
    def log(self, message: str, level: LogLevel = LogLevel.INFO) -> None:
        """
        输出日志
        
        Args:
            message: 日志消息
            level: 日志级别
        """
        if not self._should_log(level):
            return
        
        formatted_message = self._format_message(message, level)
        
        if self.console_output:
            self._write_to_console(formatted_message)
        
        if self.file_output:
            self._write_to_file(formatted_message)
    
    def debug(self, message: str) -> None:
        """输出DEBUG级别日志"""
        self.log(message, LogLevel.DEBUG)
    
    def info(self, message: str) -> None:
        """输出INFO级别日志"""
        self.log(message, LogLevel.INFO)
    
    def warning(self, message: str) -> None:
        """输出WARNING级别日志"""
        self.log(message, LogLevel.WARNING)
    
    def error(self, message: str) -> None:
        """输出ERROR级别日志"""
        self.log(message, LogLevel.ERROR)
    
    def separator(self, char: str = "-", length: int = 70) -> None:
        """输出分隔线（不使用，保留兼容性）"""
        pass
    
    def section(self, title: str, char: str = "=", length: int = 70) -> None:
        """输出章节标题"""
        self.print_with_time(char * length)
        self.print_with_time(title)
        self.print_with_time(char * length)
    
    def print_with_time(self, message: str) -> None:
        """
        兼容旧的print_with_time函数
        输出带时间戳的消息（不带日志级别标签）
        """
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        formatted_message = f"[{timestamp}] {message}"
        
        if self.console_output:
            self._write_to_console(formatted_message)
        
        if self.file_output:
            self._write_to_file(formatted_message)
    
    def close(self) -> None:
        """关闭日志（预留接口，当前实现无需特殊清理）"""
        pass
    
    # ------------------------------------------------------------------
    # 内部工具方法
    # ------------------------------------------------------------------
    def _configure_log_directory(self, log_path: Optional[str]) -> None:
        """
        配置日志目录
        
        Args:
            log_path: 用户指定的日志路径（可以是文件或目录），None 表示使用当前工作目录
        """
        if log_path:
            abs_path = os.path.abspath(log_path)
            if os.path.isdir(abs_path):
                self._log_dir = abs_path
            else:
                self._log_dir = os.path.dirname(abs_path) or os.getcwd()
        else:
            self._log_dir = os.getcwd()
        
        os.makedirs(self._log_dir, exist_ok=True)
        # 初始化当前日志文件
        self._ensure_daily_log_file(force=True)
    
    def _ensure_daily_log_file(self, force: bool = False) -> None:
        """确保按天创建日志文件"""
        if not self.file_output or not self._log_dir:
            return
        
        today = datetime.now().strftime("%Y%m%d")
        if not force and self._current_day == today and self.log_file and os.path.exists(self.log_file):
            return
        
        self._current_day = today
        file_name = f"log_{today}.log"
        full_path = os.path.join(self._log_dir, file_name)
        
        # 如果文件不存在则创建；append_mode=False 时清空旧文件
        if not os.path.exists(full_path):
            open(full_path, 'w').close()
        elif not self.append_mode:
            open(full_path, 'w').close()
        
        self.log_file = full_path


# 全局默认日志实例（仅控制台输出）
_default_logger: Optional[Logger] = None


def get_default_logger() -> Logger:
    """获取默认日志实例"""
    global _default_logger
    if _default_logger is None:
        _default_logger = Logger(console_output=True, file_output=False)
    return _default_logger


def set_default_logger(logger: Logger) -> None:
    """设置默认日志实例"""
    global _default_logger
    _default_logger = logger


def print_with_time(message: str) -> None:
    """
    全局函数：输出带时间戳的消息
    使用默认日志实例
    """
    get_default_logger().print_with_time(message)


# 全局logger实例，供其他模块直接导入使用
logger = get_default_logger()

