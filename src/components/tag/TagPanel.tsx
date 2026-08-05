import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SerializedTag } from '../../types';
import {
  Tag,
  Plus,
  Trash2,
  X,
  Check,
  Hash,
  Clock,
  User,
  AlertCircle,
  GitBranch,
  ExternalLink,
} from 'lucide-react';

interface TagPanelProps {
  repoPath: string;
  onClose: () => void;
  currentBranch?: string;
  onViewCommitHistory?: (hash: string) => void;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function TagPanel({ repoPath, onClose, currentBranch, onViewCommitHistory }: TagPanelProps) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagMessage, setNewTagMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags', repoPath],
    queryFn: () => window.electronAPI.tag.list(repoPath),
    staleTime: 5_000,
  });

  // 按时间倒序排列，最新的标签在最前面
  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => (b.date - a.date) || a.name.localeCompare(b.name)),
    [tags],
  );

  const createTagMutation = useMutation({
    mutationFn: ({ name, message }: { name: string; message?: string }) =>
      window.electronAPI.tag.create(repoPath, name, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', repoPath] });
      setShowCreate(false);
      setNewTagName('');
      setNewTagMessage('');
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.message || '创建标签失败');
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: (name: string) => window.electronAPI.tag.delete(repoPath, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', repoPath] });
    },
  });

  const handleCreate = () => {
    if (!newTagName.trim()) {
      setError('标签名称不能为空');
      return;
    }
    createTagMutation.mutate({
      name: newTagName.trim(),
      message: newTagMessage.trim() || undefined,
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 面板头 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-medium">标签管理</span>
          <span className="text-xs text-gray-500">({tags.length} 个标签)</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 border-b border-gray-700">
        {showCreate ? (
          <div className="space-y-2">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => { setNewTagName(e.target.value); setError(null); }}
              placeholder="标签名称（如 v1.0.0）"
              className="w-full bg-gray-700 text-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
              autoFocus
            />
            <input
              type="text"
              value={newTagMessage}
              onChange={(e) => setNewTagMessage(e.target.value)}
              placeholder="标签说明（可选）"
              className="w-full bg-gray-700 text-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
            {error && (
              <div className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="w-3 h-3" />
                {error}
              </div>
            )}
            <div className="flex gap-1">
              <button
                onClick={handleCreate}
                disabled={!newTagName.trim() || createTagMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                创建
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewTagName(''); setNewTagMessage(''); setError(null); }}
                className="px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-700 rounded transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-yellow-400 hover:bg-yellow-900/30 rounded transition-colors w-full"
          >
            <Plus className="w-4 h-4" />
            创建标签
          </button>
        )}
      </div>

      {/* 标签列表 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">加载中...</div>
        ) : tags.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">暂无标签</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {sortedTags.map((tag) => (
              <div key={tag.name} className="group flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors">
                <Tag className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-100 whitespace-nowrap">{tag.name}</span>
                    {tag.annotated && (
                      <span className="text-xs bg-yellow-900/40 text-yellow-300 px-1.5 py-0.5 rounded whitespace-nowrap">附注</span>
                    )}
                    {tag.branches && tag.branches.length > 0 && (
                      <span className="flex items-center gap-1 min-w-0">
                        <GitBranch className="w-3 h-3 text-gray-500 flex-shrink-0" />
                        {tag.branches.map((b, i) => (
                          <span
                            key={b}
                            className={`text-[11px] font-mono px-1 py-0.5 rounded whitespace-nowrap ${
                              b === currentBranch
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-700 text-gray-300'
                            }`}
                          >
                            {b}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-500 font-mono">{tag.commit.slice(0, 8)}</span>
                    {tag.date > 0 && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(tag.date)}
                      </span>
                    )}
                    {tag.message && (
                      <span className="text-xs text-gray-500 truncate">{tag.message}</span>
                    )}
                  </div>
                </div>
                {onViewCommitHistory && tag.commit && (
                  <button
                    onClick={() => onViewCommitHistory(tag.commit)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-blue-900/30 rounded text-blue-400 transition-all"
                    title="在提交历史中查看该标签对应的提交"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm(`确定删除标签 "${tag.name}"？`)) {
                      deleteTagMutation.mutate(tag.name);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-900/30 rounded text-red-400 transition-all"
                  title="删除标签"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}