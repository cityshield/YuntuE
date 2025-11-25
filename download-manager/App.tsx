import React, { useState, useEffect, useMemo } from 'react';
import { DownloadTask, DownloadStatus, FilterType } from './types';
import { FilterTabs } from './components/FilterTabs';
import { DownloadItem } from './components/DownloadItem';

// Initial Mock Data
const INITIAL_TASKS: DownloadTask[] = [
  {
    id: '1',
    name: 'CharacterAnimation_Final.mp4',
    totalSize: 1288490188, // ~1.2 GB
    downloadedSize: 244800000,
    speed: 21024000, // ~20MB/s
    status: DownloadStatus.Downloading,
    eta: 49,
    dateAdded: Date.now()
  },
  {
    id: '2',
    name: 'ProductShowcase_4K.mov',
    totalSize: 891289600, // 850 MB
    downloadedSize: 668467200,
    speed: 21580000,
    status: DownloadStatus.Downloading,
    eta: 10,
    dateAdded: Date.now() - 10000
  },
  {
    id: '3',
    name: 'ArchViz_Interior_Frames.zip',
    totalSize: 3328599654, // 3.10 GB
    downloadedSize: 0,
    speed: 0,
    status: DownloadStatus.Waiting,
    dateAdded: Date.now() - 20000
  },
  {
    id: '4',
    name: 'VFX_Explosion_Sequence.exr',
    totalSize: 471859200, // 450 MB
    downloadedSize: 0,
    speed: 0,
    status: DownloadStatus.Waiting,
    dateAdded: Date.now() - 30000
  },
  {
    id: '5',
    name: 'GameCinematic_Master.avi',
    totalSize: 3006477107, // 2.80 GB
    downloadedSize: 1170370000,
    speed: 0,
    status: DownloadStatus.Paused,
    dateAdded: Date.now() - 40000
  },
  {
    id: '6',
    name: 'MotionGraphics_Comp.mp4',
    totalSize: 713031680, // 680 MB
    downloadedSize: 713031680,
    speed: 0,
    status: DownloadStatus.Completed,
    dateAdded: Date.now() - 100000
  },
  {
    id: '7',
    name: 'RenderLayers_Beauty.zip',
    totalSize: 1610612736, // 1.50 GB
    downloadedSize: 1610612736,
    speed: 0,
    status: DownloadStatus.Completed,
    dateAdded: Date.now() - 200000
  },
  {
    id: '8',
    name: 'Failed_Render_Log.txt',
    totalSize: 10240,
    downloadedSize: 512,
    speed: 0,
    status: DownloadStatus.Failed,
    dateAdded: Date.now() - 300000
  }
];

const App: React.FC = () => {
  const [tasks, setTasks] = useState<DownloadTask[]>(INITIAL_TASKS);
  const [filter, setFilter] = useState<FilterType>('all');

  // Simulation effect to move progress bars
  useEffect(() => {
    const interval = setInterval(() => {
      setTasks(prevTasks => prevTasks.map(task => {
        if (task.status === DownloadStatus.Downloading) {
          const newDownloaded = Math.min(task.downloadedSize + (task.speed / 5), task.totalSize); // Update every 200ms
          const isFinished = newDownloaded >= task.totalSize;
          
          if (isFinished) {
            return {
              ...task,
              downloadedSize: task.totalSize,
              status: DownloadStatus.Completed,
              speed: 0,
              eta: 0
            };
          }

          return {
            ...task,
            downloadedSize: newDownloaded,
            eta: Math.max(0, (task.totalSize - newDownloaded) / task.speed)
          };
        }
        return task;
      }));
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const counts = useMemo(() => {
    const c = {
      all: tasks.length,
      [DownloadStatus.Downloading]: 0,
      [DownloadStatus.Waiting]: 0,
      [DownloadStatus.Paused]: 0,
      [DownloadStatus.Completed]: 0,
      [DownloadStatus.Failed]: 0,
    };
    tasks.forEach(t => c[t.status]++);
    return c;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter(t => t.status === filter);
  }, [tasks, filter]);

  // Handlers
  const handlePause = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: DownloadStatus.Paused } : t));
  };

  const handleResume = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: DownloadStatus.Downloading, speed: 15000000 } : t)); // Mock speed on resume
  };

  const handleCancel = (id: string) => {
     // In a real app this would stop the connection. Here we just remove it for simplicity or mark as cancelled. 
     // Let's remove it to demonstrate list interaction.
     setTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleRetry = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: DownloadStatus.Waiting, downloadedSize: 0 } : t));
    // Simulate picking it up shortly
    setTimeout(() => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status: DownloadStatus.Downloading, speed: 10000000 } : t));
    }, 1000);
  };

  const handleDelete = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleClearCompleted = () => {
    setTasks(prev => prev.filter(t => t.status !== DownloadStatus.Completed));
  };

  const handleOpenFolder = (id: string) => {
    alert(`Opening folder for task ${id}`);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header Area */}
      <header className="flex-none pt-8 pb-4 px-6 max-w-5xl mx-auto w-full">
        <div className="flex justify-between items-end mb-8">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Downloads</h1>
                <p className="text-slate-400 text-sm mt-1">Manage your active files and queue</p>
            </div>
            
            {/* Global quick stats */}
            <div className="hidden md:flex gap-6 text-sm text-slate-400 border-l border-slate-800 pl-6">
                <div className="flex flex-col">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Speed</span>
                    <span className="text-white font-mono">42.5 MB/s</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Remaining</span>
                    <span className="text-white font-mono">~5 mins</span>
                </div>
            </div>
        </div>

        <FilterTabs 
          currentFilter={filter}
          onFilterChange={setFilter}
          counts={counts}
          onClearCompleted={handleClearCompleted}
        />
      </header>

      {/* Main List Area */}
      <main className="flex-1 overflow-y-auto px-6 pb-12">
        <div className="max-w-5xl mx-auto">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-600 border-2 border-dashed border-slate-800/50 rounded-xl">
              <p>暂无任务</p>
            </div>
          ) : (
            filteredTasks.map(task => (
              <DownloadItem
                key={task.id}
                task={task}
                onPause={handlePause}
                onResume={handleResume}
                onCancel={handleCancel}
                onRetry={handleRetry}
                onDelete={handleDelete}
                onOpenFolder={handleOpenFolder}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default App;