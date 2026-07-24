import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SerializedStash } from '../../types';
import {
  Archive,
  Plus,
  Play,
  Trash2,
  X,
  Clock,
  GitBranch,
  FileCode,
  AlertCircle,
} from 'lucide-react';

interface StashPanelProps {
  repoPath: string;
  onClose: () => void;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function StashPanel({ repoPath, onClose }: StashPanelProps) {
  const queryClient = useQueryClient();
  const [stashMessage, setStashMessage] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: stashes = [], isLoading } = useQuery({
    queryKey: ['stashes', repoPath],
    queryFn: () => window.electronAPI.stash.list(repoPath),
    staleTime: 3_000,
    refetchInterval: 10_000,
  });

  const saveMutation = useMutation({
    mutationFn: (message?: string) => window.electronAPI.stash.save(repoPath, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stashes', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['status', repoPath] });
      setShowSave(false);
      setStashMessage('');
      setError(null);
    },
    onError: (err: any) => setError(err?.message || '暂存失败'),
  });

  const popMutation = useMutation({
    mutationFn: (index?: number) => window.electronAPI.stash.pop(repoPath, index),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stashes', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['status', repoPath] });
    },
    onError: (err: any) => setError(err?.message || '弹出失败'),
  });

  const applyMutation = useMutation({
    mutationFn: (index: number) => window.electronAPI.stash.apply(repoPath, index),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stashes', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['status', repoPath] });
    },
  });

  const dropMutation = useMutation({
    mutationFn: (index: number) => window.electronAPI.stash.drop(repoPath, index),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stashes', repoPath] });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(stashMessage.trim() || undefined);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 面板头 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium">Stash 暂存</span>
          <span className="text-xs text-gray-500">({stashes.length} 个暂存)</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 保存新 Stash */}
      <div className="p-3 border-b border-gray-700">
        {showSave ? (
          <div className="space-y-2">
            <input
              type="text"
              value={stashMessage}
              onChange={(e) => { setStashMessage(e.target.value); setError(null); }}
              placeholder="暂存说明（可选）"
              className="w-full bg-gray-700 text-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSave(false); }}
              autoFocus
            />
            {error && (
              <div className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="w-3 h-3" />
                {error}
              </div>
            )}
            <div className="flex gap-1">
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
                暂存
              </button>
              <button
                onClick={() => { setShowSave(false); setStashMessage(''); setError(null); }}
                className="px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-700 rounded transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowSave(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-orange-400 hover:bg-orange-900/30 rounded transition-colors w-full"
          >
            <Plus className="w-4 h-4" />
            暂存当前变更
          </button>
        )}
      </div>

      {/* Stash 列表 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">加载中...</div>
        ) : stashes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">没有暂存记录</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {stashes.map((stash) => (
              <StashItem
                key={stash.id}
                stash={stash}
                onPop={() => popMutation.mutate(stash.index)}
                onApply={() => applyMutation.mutate(stash.index)}
                onDrop={() => {
                  if (confirm(`确定丢弃 stash@{${stash.index}}？`)) {
                    dropMutation.mutate(stash.index);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface StashItemProps {
  stash: SerializedStash;
  onPop: () => void;
  onApply: () => void;
  onDrop: () => void;
}

function StashItem({ stash, onPop, onApply, onDrop }: StashItemProps) {
  return (
    <div className="group flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors">
      <Archive className="w-4 h-4 text-orange-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-100 truncate">
            {stash.message || `WIP on ${stash.branch || 'unknown'}`}
          </span>
          <span className="text-xs text-gray-500 font-mono flex-shrink-0">
            {stash.id}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(stash.date)}
          </span>
          {stash.branch && (
            <span className="flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {stash.branch}
            </span>
          )}
          <span className="flex items-center gap-1">
            <FileCode className="w-3 h-3" />
            stash@{stash.index}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onPop}
          className="p-1.5 hover:bg-green-900/30 rounded text-green-400"
          title="弹出（恢复并删除）"
        >
          <Play className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onApply}
          className="p-1.5 hover:bg-blue-900/30 rounded text-blue-400"
          title="应用（保留暂存）"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDrop}
          className="p-1.5 hover:bg-red-900/30 rounded text-red-400"
          title="丢弃"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}