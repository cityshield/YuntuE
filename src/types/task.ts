/**
 * 任务相关类型定义
 * 与后端 schemas/task.py 保持一致
 */

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  DRAFT = 0,        // 草稿
  PENDING = 1,      // 待处理
  QUEUED = 2,       // 队列中
  RENDERING = 3,    // 渲染中
  PAUSED = 4,       // 已暂停
  COMPLETED = 5,    // 已完成
  FAILED = 6,       // 失败
  CANCELLED = 7,    // 已取消
}

/**
 * 任务状态中文映射
 */
export const TaskStatusLabels: Record<TaskStatus, string> = {
  [TaskStatus.DRAFT]: '草稿',
  [TaskStatus.PENDING]: '待处理',
  [TaskStatus.QUEUED]: '队列中',
  [TaskStatus.RENDERING]: '渲染中',
  [TaskStatus.PAUSED]: '已暂停',
  [TaskStatus.COMPLETED]: '已完成',
  [TaskStatus.FAILED]: '失败',
  [TaskStatus.CANCELLED]: '已取消',
}

/**
 * 任务优先级枚举
 */
export enum TaskPriority {
  LOW = 0,      // 低
  NORMAL = 1,   // 普通
  HIGH = 2,     // 高
  URGENT = 3,   // 紧急
}

/**
 * 任务优先级中文映射
 */
export const TaskPriorityLabels: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: '低',
  [TaskPriority.NORMAL]: '普通',
  [TaskPriority.HIGH]: '高',
  [TaskPriority.URGENT]: '紧急',
}

/**
 * 任务基础信息
 */
export interface TaskBase {
  task_name: string
  scene_file?: string
  maya_version?: string
  renderer?: string
  priority: number
  start_frame?: number
  end_frame?: number
  frame_step: number
  width?: number
  height?: number
  output_path?: string
  output_format?: string
}

/**
 * 创建任务请求
 */
export interface TaskCreate extends TaskBase {}

/**
 * 更新任务请求
 */
export interface TaskUpdate {
  task_name?: string
  scene_file?: string
  maya_version?: string
  renderer?: string
  priority?: number
  start_frame?: number
  end_frame?: number
  frame_step?: number
  width?: number
  height?: number
  output_path?: string
  output_format?: string
}

/**
 * 任务状态更新请求
 */
export interface TaskStatusUpdate {
  status: number
  progress?: number
  error_message?: string
}

/**
 * 任务响应
 */
export interface TaskResponse {
  id: string
  user_id: string
  task_name: string
  scene_file?: string
  maya_version?: string
  renderer?: string
  status: number
  priority: number
  progress: number
  start_frame?: number
  end_frame?: number
  frame_step: number
  width?: number
  height?: number
  output_path?: string
  output_format?: string
  estimated_cost?: number
  actual_cost?: number
  error_message?: string
  created_at: string
  started_at?: string
  completed_at?: string
  updated_at?: string
}

/**
 * 任务列表响应
 */
export interface TaskListResponse {
  tasks: TaskResponse[]
  total: number
  skip: number
  limit: number
}

/**
 * 任务日志基础信息
 */
export interface TaskLogBase {
  log_level: string
  message: string
}

/**
 * 创建任务日志请求
 */
export interface TaskLogCreate extends TaskLogBase {
  task_id: string
}

/**
 * 任务日志响应
 */
export interface TaskLogResponse extends TaskLogBase {
  id: number
  task_id: string
  created_at: string
}

/**
 * 任务日志列表响应
 */
export interface TaskLogsResponse {
  logs: TaskLogResponse[]
  total: number
}

/**
 * 获取任务列表查询参数
 */
export interface GetTasksParams {
  status?: number
  skip?: number
  limit?: number
  search?: string
  time_range?: 'week' | 'month' | 'quarter'
}
