import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SerializedRemote } from '../../types';
import {
  GitBranch,
  Plus,
  Trash2,
  X,
  Check,
  Edit3,
  ExternalLink,
  AlertCircle,
  Globe,
  RefreshCw,
} from 'lucide-react';

interface RemotePanelProps {
  repoPath: string;
  onClose: () => void;
}

export function RemotePanel({ repoPath, onClose }: RemotePanelProps) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [editingRemote, setEditingRemote] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: remotes = [], isLoading } = useQuery({
    queryKey: ['remotes', repoPath],
    queryFn: () => window.electronAPI.remote.list(repoPath),
    staleTime: 5_000,
  });

  const addMutation = useMutation({
    mutationFn: ({ name, url }: { name: string; url: string }) =>
      window.electronAPI.remote.add(repoPath, name, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remotes', repoPath] });
      setShowAdd(false);
      setNewName('');
      setNewUrl('');
      setError(null);
    },
    onError: (err: any) => setError(err?.message || '添加远程仓库失败'),
  });

  const removeMutation = useMutation({
    mutationFn: (name: string) => window.electronAPI.remote.remove(repoPath, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['remotes', repoPath] }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) =>
      window.electronAPI.remote.rename(repoPath, oldName, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remotes', repoPath] });
      setEditingRemote(null);
    },
    onError: (err: any) => setError(err?.message || '重命名失败'),
  });

  const setUrlMutation = useMutation({
    mutationFn: ({ name, url }: { name: string; url: string }) =>
      window.electronAPI.remote.setUrl(repoPath, name, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remotes', repoPath] });
      setEditingRemote(null);
    },
    onError: (err: any) => setError(err?.message || '设置 URL 失败'),
  });

  const handleAdd = () => {
    if (!newName.trim() || !newUrl.trim()) {
      setError('名称和 URL 不能为空');
      return;
    }
    addMutation.mutate({ name: newName.trim(), url: newUrl.trim() });
  };

  const handleSaveEdit = (remote: SerializedRemote) => {
    if (editName !== remote.name) {
      renameMutation.mutate({ oldName: remote.name, newName: editName });
    }
    if (editUrl !== remote.refs.fetch) {
      setUrlMutation.mutate({ name: editName, url: editUrl });
    }
    if (editName === remote.name && editUrl === remote.refs.fetch) {
      setEditingRemote(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 面板头 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium">远程仓库管理</span>
          <span className="text-xs text-gray-500">({remotes.length} 个远程)</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 添加远程 */}
      <div className="p-3 border-b border-gray-700">
        {showAdd ? (
          <div className="space-y-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setError(null); }}
              placeholder="远程名称（如 origin）"
              className="w-full bg-gray-700 text-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              autoFocus
            />
            <input
              type="text"
              value={newUrl}
              onChange={(e) => { setNewUrl(e.target.value); setError(null); }}
              placeholder="远程 URL（如 https://github.com/user/repo.git）"
              className="w-full bg-gray-700 text-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
            />
            {error && (
              <div className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="w-3 h-3" />
                {error}
              </div>
            )}
            <div className="flex gap-1">
              <button
                onClick={handleAdd}
                disabled={!newName.trim() || !newUrl.trim() || addMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                添加
              </button>
              <button
                onClick={() => { setShowAdd(false); setNewName(''); setNewUrl(''); setError(null); }}
                className="px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-700 rounded transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-400 hover:bg-blue-900/30 rounded transition-colors w-full"
          >
            <Plus className="w-4 h-4" />
            添加远程仓库
          </button>
        )}
      </div>

      {/* 远程列表 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">加载中...</div>
        ) : remotes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">没有远程仓库</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {remotes.map((remote) => (
              <div key={remote.name} className="group px-4 py-3 hover:bg-gray-800/50 transition-colors">
                {editingRemote === remote.name ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-gray-700 text-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      className="w-full bg-gray-700 text-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleSaveEdit(remote)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-500 rounded transition-colors"
                      >
                        <Check className="w-3 h-3" /> 保存
                      </button>
                      <button
                        onClick={() => setEditingRemote(null)}
                        className="px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 rounded transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-100">{remote.name}</div>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        <span className="text-xs text-gray-500 truncate" title={remote.refs.fetch}>
                          <span className="text-gray-600">fetch: </span>{remote.refs.fetch || '-'}
                        </span>
                        <span className="text-xs text-gray-500 truncate" title={remote.refs.push}>
                          <span className="text-gray-600">push: </span>{remote.refs.push || '-'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingRemote(remote.name);
                          setEditName(remote.name);
                          setEditUrl(remote.refs.fetch);
                          setError(null);
                        }}
                        className="p-1.5 hover:bg-blue-900/30 rounded text-blue-400"
                        title="编辑"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`确定删除远程仓库 "${remote.name}"？`)) {
                            removeMutation.mutate(remote.name);
                          }
                        }}
                        className="p-1.5 hover:bg-red-900/30 rounded text-red-400"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}