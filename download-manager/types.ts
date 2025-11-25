export enum DownloadStatus {
  Downloading = 'downloading',
  Paused = 'paused',
  Waiting = 'waiting',
  Completed = 'completed',
  Failed = 'failed',
}

export interface DownloadTask {
  id: string;
  name: string;
  totalSize: number; // in bytes
  downloadedSize: number; // in bytes
  speed: number; // bytes per second
  status: DownloadStatus;
  eta?: number; // seconds remaining
  dateAdded: number;
}

export type FilterType = 'all' | DownloadStatus;