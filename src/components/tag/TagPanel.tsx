import { useState, useMemo, useEffect } from 'react';
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
  Upload,
  Loader2,
  RefreshCw,
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
  // 推送标签的结果提示（成功自动消失，失败需手动关闭）
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags', repoPath],
    queryFn: () => window.electronAPI.tag.list(repoPath),
    staleTime: 5_000,
  });

  // 远程已存在的标签，用于判断本地标签是否已推送；remote 为空表示未配置远程
  const {
    data: remoteTags,
    isFetching: remoteTagsFetching,
    error: remoteTagsError,
    refetch: refetchRemoteTags,
  } = useQuery({
    queryKey: ['tagRemoteTags', repoPath],
    queryFn: () => window.electronAPI.tag.remoteTags(repoPath),
    staleTime: 30_000,
    retry: 1,
  });
  const remoteTagSet = useMemo(() => new Set(remoteTags?.tags ?? []), [remoteTags]);

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

  // 推送标签到远程（远程名缺省时后端按跟踪分支/origin 解析）
  const pushTagMutation = useMutation({
    mutationFn: (name: string) => window.electronAPI.tag.push(repoPath, name),
    onSuccess: (_data, name) => {
      setNotice({ type: 'success', text: `标签 "${name}" 已推送到远程` });
      // 推送状态徽章立即刷新
      queryClient.invalidateQueries({ queryKey: ['tagRemoteTags', repoPath] });
    },
    onError: (err: any) => setNotice({
      type: 'error',
      text: String(err?.message || err || '').replace(
        /^Error: Error invoking remote method 'tag:push': Error: /,
        '',
      ) || '推送失败',
    }),
  });

  // 成功提示 3 秒后自动消失
  useEffect(() => {
    if (notice?.type !== 'success') return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

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
          {remoteTags && remoteTags.remote && (
            <span className="text-xs text-gray-500">远程: {remoteTags.remote}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refetchRemoteTags()}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="刷新远程推送状态"
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${remoteTagsFetching ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 远程状态提示 */}
      {remoteTagsError && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-700 bg-gray-800/50 text-xs text-gray-400 flex-shrink-0">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-gray-500" />
          <span className="flex-1">无法获取远程标签状态（可能未联网），可稍后刷新重试</span>
          <button onClick={() => refetchRemoteTags()} className="px-2 py-0.5 hover:bg-gray-700 rounded text-gray-300 transition-colors">重试</button>
        </div>
      )}
      {remoteTags && !remoteTags.remote && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-700 bg-gray-800/50 text-xs text-gray-400 flex-shrink-0">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-gray-500" />
          <span className="flex-1">未配置远程仓库，标签仅保存在本地</span>
        </div>
      )}

      {/* 推送结果提示 */}
      {notice && (
        <div
          className={`flex items-center gap-2 px-4 py-1.5 border-b text-xs flex-shrink-0 ${
            notice.type === 'success'
              ? 'bg-green-900/30 border-green-800/60 text-green-300'
              : 'bg-red-900/30 border-red-800/60 text-red-300'
          }`}
        >
          {notice.type === 'success'
            ? <Check className="w-3.5 h-3.5 shrink-0" />
            : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
          <span className="flex-1 break-all">{notice.text}</span>
          <button onClick={() => setNotice(null)} className="p-0.5 hover:bg-gray-700 rounded shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
                    {remoteTags?.remote && (
                      remoteTagSet.has(tag.name) ? (
                        <span
                          className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-300 whitespace-nowrap"
                          title={`已推送到远程 ${remoteTags.remote}`}
                        >
                          <Check className="w-3 h-3" />
                          已推送
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 whitespace-nowrap"
                          title={`尚未推送到远程 ${remoteTags.remote}`}
                        >
                          <Upload className="w-3 h-3" />
                          未推送
                        </span>
                      )
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
                {remoteTags?.remote && (
                  <button
                    onClick={() => { setNotice(null); pushTagMutation.mutate(tag.name); }}
                    disabled={pushTagMutation.isPending && pushTagMutation.variables === tag.name}
                    className={`p-1.5 hover:bg-blue-900/30 rounded text-blue-400 transition-all disabled:cursor-default ${
                      remoteTagSet.has(tag.name) ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
                    }`}
                    title={remoteTagSet.has(tag.name) ? '重新推送到远程' : '推送标签到远程'}
                  >
                    {pushTagMutation.isPending && pushTagMutation.variables === tag.name
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Upload className="w-3.5 h-3.5" />}
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