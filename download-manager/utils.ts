import { DownloadStatus } from './types';

export const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const formatTime = (seconds: number) => {
  if (!seconds || seconds === Infinity) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
};

export const getStatusColor = (status: DownloadStatus) => {
  switch (status) {
    case DownloadStatus.Downloading: return 'text-blue-400';
    case DownloadStatus.Completed: return 'text-emerald-400';
    case DownloadStatus.Failed: return 'text-rose-400';
    case DownloadStatus.Paused: return 'text-amber-400';
    default: return 'text-slate-400';
  }
};

export const getProgressBarColor = (status: DownloadStatus) => {
  switch (status) {
    case DownloadStatus.Downloading: return 'bg-blue-500';
    case DownloadStatus.Completed: return 'bg-emerald-500';
    case DownloadStatus.Failed: return 'bg-rose-500';
    case DownloadStatus.Paused: return 'bg-amber-500';
    default: return 'bg-slate-600';
  }
};