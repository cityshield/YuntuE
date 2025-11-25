import React from 'react';
import { FilterType, DownloadStatus } from '../types';

interface FilterTabsProps {
  currentFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  counts: Record<FilterType, number>;
  onClearCompleted: () => void;
}

export const FilterTabs: React.FC<FilterTabsProps> = ({ 
  currentFilter, 
  onFilterChange, 
  counts,
  onClearCompleted
}) => {
  
  const tabs: { key: FilterType; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: DownloadStatus.Downloading, label: '下载中' },
    { key: DownloadStatus.Waiting, label: '等待中' },
    { key: DownloadStatus.Completed, label: '已完成' },
    { key: DownloadStatus.Failed, label: '失败' },
  ];

  return (
    <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
      <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-800/50 backdrop-blur-sm overflow-x-auto w-full sm:w-auto">
        {tabs.map((tab) => {
          const isActive = currentFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onFilterChange(tab.key)}
              className={`
                relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap
                ${isActive 
                  ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}
              `}
            >
              {tab.label}
              <span className={`
                ml-1 text-xs px-1.5 py-0.5 rounded-full
                ${isActive ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-500'}
              `}>
                {counts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onClearCompleted}
        className="text-xs font-medium text-slate-400 hover:text-rose-400 transition-colors px-4 py-2 border border-slate-800 rounded-lg hover:border-rose-900/50 hover:bg-rose-950/30 flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        清除已完成
      </button>
    </div>
  );
};