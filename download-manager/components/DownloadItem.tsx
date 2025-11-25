import React from 'react';
import { DownloadTask, DownloadStatus } from '../types';
import { formatBytes, formatTime, getProgressBarColor, getStatusColor } from '../utils';
import { 
  Play, 
  Pause, 
  X, 
  FolderOpen, 
  FileVideo, 
  FileArchive, 
  FileCode, 
  File, 
  RotateCcw,
  Trash2
} from 'lucide-react';

interface DownloadItemProps {
  task: DownloadTask;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenFolder: (id: string) => void;
}

export const DownloadItem: React.FC<DownloadItemProps> = ({
  task,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onDelete,
  onOpenFolder,
}) => {
  const progress = task.totalSize > 0 ? (task.downloadedSize / task.totalSize) * 100 : 0;
  
  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['mp4', 'mov', 'avi', 'mkv'].includes(ext || '')) return <FileVideo className="w-6 h-6 text-indigo-400" />;
    if (['zip', 'rar', '7z', 'tar'].includes(ext || '')) return <FileArchive className="w-6 h-6 text-amber-400" />;
    if (['js', 'ts', 'json', 'py', 'exr'].includes(ext || '')) return <FileCode className="w-6 h-6 text-emerald-400" />;
    return <File className="w-6 h-6 text-slate-400" />;
  };

  const getStatusText = (status: DownloadStatus) => {
    switch (status) {
      case DownloadStatus.Downloading: return '下载中...';
      case DownloadStatus.Paused: return '已暂停';
      case DownloadStatus.Waiting: return '等待中';
      case DownloadStatus.Completed: return '下载完成';
      case DownloadStatus.Failed: return '下载失败';
    }
  };

  return (
    <div className="group relative bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-all duration-200 shadow-sm hover:shadow-md mb-3">
      {/* Absolute progress bar background for subtle effect (optional) */}
      {/* <div className="absolute bottom-0 left-0 h-1 bg-slate-800 w-full rounded-b-xl overflow-hidden">
        <div className={`h-full transition-all duration-500 ${getProgressBarColor(task.status)}`} style={{ width: `${progress}%` }} />
      </div> */}

      <div className="flex items-center gap-4">
        {/* Icon Container */}
        <div className="flex-shrink-0 w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700/50">
          {getFileIcon(task.name)}
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          
          {/* File Info */}
          <div className="md:col-span-5 pr-4">
            <h3 className="text-sm font-semibold text-slate-100 truncate mb-1" title={task.name}>
              {task.name}
            </h3>
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span className={getStatusColor(task.status)}>{getStatusText(task.status)}</span>
              <span className="w-1 h-1 rounded-full bg-slate-700"></span>
              <span>{formatBytes(task.downloadedSize)} / {formatBytes(task.totalSize)}</span>
            </div>
          </div>

          {/* Progress & Speed */}
          <div className="md:col-span-4 flex flex-col justify-center">
             {task.status !== DownloadStatus.Completed && task.status !== DownloadStatus.Failed ? (
               <>
                 <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                   <span>{progress.toFixed(1)}%</span>
                   {task.status === DownloadStatus.Downloading && (
                      <span className="tabular-nums opacity-80">{formatBytes(task.speed)}/s · 剩余 {formatTime(task.eta || 0)}</span>
                   )}
                 </div>
                 <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                   <div 
                     className={`h-full rounded-full transition-all duration-300 ease-out ${getProgressBarColor(task.status)}`} 
                     style={{ width: `${progress}%` }} 
                   />
                 </div>
               </>
             ) : task.status === DownloadStatus.Completed ? (
               <div className="h-1.5 w-full bg-slate-800/50 rounded-full overflow-hidden">
                   <div className="h-full bg-emerald-500 w-full rounded-full" />
               </div>
             ) : (
                <div className="h-1.5 w-full bg-slate-800/50 rounded-full overflow-hidden">
                   <div className="h-full bg-rose-500 w-[100%] rounded-full opacity-30" />
               </div>
             )}
          </div>

          {/* Actions */}
          <div className="md:col-span-3 flex justify-end gap-2 items-center">
            {task.status === DownloadStatus.Downloading && (
              <>
                <button onClick={() => onPause(task.id)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors" title="暂停">
                  <Pause className="w-4 h-4" />
                </button>
                <button onClick={() => onCancel(task.id)} className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/30 text-slate-300 hover:text-rose-400 transition-colors" title="取消">
                  <X className="w-4 h-4" />
                </button>
              </>
            )}

            {(task.status === DownloadStatus.Paused || task.status === DownloadStatus.Waiting) && (
              <>
                <button onClick={() => onResume(task.id)} className="p-2 rounded-lg bg-slate-800 hover:bg-blue-900/30 text-slate-300 hover:text-blue-400 transition-colors" title="继续">
                  <Play className="w-4 h-4" />
                </button>
                <button onClick={() => onCancel(task.id)} className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/30 text-slate-300 hover:text-rose-400 transition-colors" title="取消">
                  <X className="w-4 h-4" />
                </button>
              </>
            )}

            {task.status === DownloadStatus.Failed && (
              <>
                <button onClick={() => onRetry(task.id)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors" title="重试">
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button onClick={() => onDelete(task.id)} className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/30 text-slate-300 hover:text-rose-400 transition-colors" title="删除">
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}

            {task.status === DownloadStatus.Completed && (
              <>
                <button onClick={() => onOpenFolder(task.id)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-colors border border-transparent hover:border-slate-600">
                  <FolderOpen className="w-4 h-4" />
                  打开文件夹
                </button>
                <button onClick={() => onDelete(task.id)} className="p-2 rounded-lg hover:bg-rose-900/20 text-slate-400 hover:text-rose-400 transition-colors" title="删除记录">
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};