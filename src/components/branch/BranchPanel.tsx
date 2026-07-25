import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SerializedBranch } from '../../types';
import {
  GitBranch,
  GitFork,
  Check,
  X,
  ChevronLeft,
  Plus,
  Trash2,
  Merge,
  Search,
  ArrowRight,
} from 'lucide-react';

interface BranchPanelProps {
  branches: SerializedBranch[];
  currentBranch: string;
  onCheckout: (branch: string) => void;
  onClose: () => void;
  repoPath: string;
}

export function BranchPanel({
  branches,
  currentBranch,
  onCheckout,
  onClose,
  repoPath,
}: BranchPanelProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [baseBranch, setBaseBranch] = useState(currentBranch);

  // 创建分支
  const createBranchMutation = useMutation({
    mutationFn: (name: string) =>
      window.electronAPI.branch.create(repoPath, name, baseBranch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] });
      setShowCreateBranch(false);
      setNewBranchName('');
    },
  });

  // 删除分支
  const deleteBranchMutation = useMutation({
    mutationFn: (name: string) =>
      window.electronAPI.branch.delete(repoPath, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
  });

  // 合并分支
  const mergeBranchMutation = useMutation({
    mutationFn: (branch: string) =>
      window.electronAPI.branch.merge(repoPath, branch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['status', repoPath] });
    },
  });

  const filteredBranches = branches.filter((b) =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const localBranches = filteredBranches.filter((b) => !b.remote);
  const remoteBranches = filteredBranches.filter((b) => b.remote);

  const handleCreateBranch = () => {
    if (!newBranchName.trim()) return;
    createBranchMutation.mutate(newBranchName.trim());
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 面板头 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <GitBranch className="w-4 h-4 text-green-400" />
        <span className="text-sm font-medium">分支管理</span>
      </div>

      {/* 搜索框 */}
      <div className="px-4 py-2 border-b border-gray-700">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索分支..."
            className="w-full bg-gray-700 text-gray-100 rounded pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
          />
        </div>
      </div>

      {/* 创建分支按钮 */}
      <div className="px-4 py-2 border-b border-gray-700">
        {showCreateBranch ? (
          <div className="space-y-2">
            <input
              type="text"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="新分支名称"
              className="w-full bg-gray-700 text-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateBranch();
                if (e.key === 'Escape') setShowCreateBranch(false);
              }}
              autoFocus
            />
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <span>基于：</span>
              <select
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                className="bg-gray-700 text-gray-300 rounded px-2 py-0.5 text-xs"
              >
                {localBranches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || createBranchMutation.isPending}
                className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-xs transition-colors"
              >
                <Plus className="w-3 h-3" />
                创建
              </button>
              <button
                onClick={() => {
                  setShowCreateBranch(false);
                  setNewBranchName('');
                }}
                className="px-3 py-1 text-xs text-gray-400 hover:bg-gray-700 rounded transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreateBranch(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-green-400 hover:bg-green-900/30 rounded transition-colors w-full"
          >
            <Plus className="w-4 h-4" />
            新建分支
          </button>
        )}
      </div>

      {/* 分支列表 */}
      <div className="flex-1 overflow-y-auto">
        {/* 本地分支（当前分支排在最前面） */}
        <div className="px-3 py-2 text-xs text-gray-500 font-medium uppercase tracking-wider">
          本地分支
        </div>
        {[...localBranches].sort((a, b) => {
          // 当前分支排在最前面
          if (a.name === currentBranch) return -1;
          if (b.name === currentBranch) return 1;
          return a.name.localeCompare(b.name);
        }).map((branch) => (
          <BranchItem
            key={branch.name}
            branch={branch}
            isCurrent={branch.name === currentBranch}
            onCheckout={onCheckout}
            onDelete={() => deleteBranchMutation.mutate(branch.name)}
            onMerge={() => mergeBranchMutation.mutate(branch.name)}
          />
        ))}

        {/* 远程分支（当前跟踪分支排在最前面） */}
        {remoteBranches.length > 0 && (
          <>
            <div className="px-3 py-2 text-xs text-gray-500 font-medium uppercase tracking-wider border-t border-gray-700 mt-2">
              远程分支
            </div>
            {remoteBranches.map((branch) => (
              <BranchItem
                key={branch.name}
                branch={branch}
                isCurrent={false}
                onCheckout={() => {
                  // 检出远程分支 = 创建并切换到本地跟踪分支
                  const localName = branch.name.replace('origin/', '');
                  onCheckout(branch.name);
                }}
                onDelete={undefined}
                onMerge={undefined}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

interface BranchItemProps {
  branch: SerializedBranch;
  isCurrent: boolean;
  onCheckout: (name: string) => void;
  onDelete?: () => void;
  onMerge?: () => void;
}

function BranchItem({ branch, isCurrent, onCheckout, onDelete, onMerge }: BranchItemProps) {
  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2 transition-colors ${
        isCurrent
          ? 'bg-blue-900/30 text-blue-300'
          : 'text-gray-300 hover:bg-gray-800'
      }`}
    >
      <GitFork className={`w-4 h-4 flex-shrink-0 ${isCurrent ? 'text-blue-400' : 'text-gray-500'}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm truncate">
            {branch.remote ? branch.name : branch.name}
          </span>
          {isCurrent && (
            <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded">
              当前
            </span>
          )}
        </div>

        {/* 显示跟踪关系和 ahead/behind 信息 */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {branch.tracking && (
            <>
              <ArrowRight className="w-3 h-3 text-gray-500" />
              <span className="text-xs text-gray-400 truncate">{branch.tracking}</span>
              {/* ahead/behind 徽章 */}
              {branch.ahead !== undefined && branch.ahead > 0 && (
                <span className="text-xs bg-green-600/30 text-green-400 px-1.5 py-0.5 rounded">
                  ahead {branch.ahead}
                </span>
              )}
              {branch.behind !== undefined && branch.behind > 0 && (
                <span className="text-xs bg-red-600/30 text-red-400 px-1.5 py-0.5 rounded">
                  behind {branch.behind}
                </span>
              )}
            </>
          )}
          {!branch.remote && !branch.tracking && (
            <span className="text-xs text-gray-500">(未跟踪)</span>
          )}
        </div>

        <div className="text-xs text-gray-500 truncate">
          {branch.commit?.slice(0, 8)}
        </div>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isCurrent && (
          <>
            <button
              onClick={() => onCheckout(branch.name)}
              className="p-1 hover:bg-blue-900/30 rounded text-blue-400"
              title="切换到该分支"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            {onMerge && (
              <button
                onClick={onMerge}
                className="p-1 hover:bg-purple-900/30 rounded text-purple-400"
                title="合并到当前分支"
              >
                <Merge className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && !branch.remote && (
              <button
                onClick={onDelete}
                className="p-1 hover:bg-red-900/30 rounded text-red-400"
                title="删除分支"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}