import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SerializedBranch } from '../../types';
import {
  GitBranch,
  GitFork,
  Check,
  ChevronLeft,
  Plus,
  Trash2,
  Merge,
  Search,
  ArrowRight,
} from 'lucide-react';
import { CheckoutDialog } from '../remote/PullProgressDialog';

interface BranchPanelProps {
  branches: SerializedBranch[];
  currentBranch: string;
  onClose: () => void;
  repoPath: string;
}

/** 检查工作区是否干净（直接读取 status 判断） */
async function checkIsClean(repoPath: string): Promise<boolean> {
  try {
    const status = await window.electronAPI.workdir.status(repoPath);
    return status.isClean && status.conflicted.length === 0;
  } catch {
    return true; // 出错时默认干净，让 checkout 失败时再处理
  }
}

/** 格式化相对时间 */
function formatRelativeTime(dateMs: number | undefined): string {
  if (!dateMs) return '';
  const diff = Date.now() - dateMs;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

export function BranchPanel({
  branches,
  currentBranch,
  onClose,
  repoPath,
}: BranchPanelProps) {
  const queryClient = useQueryClient();

  // 搜索 / 创建分支状态
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [baseBranch, setBaseBranch] = useState(currentBranch);

  // 检出流程状态
  const [checkoutState, setCheckoutState] = useState<{
    phase: 'idle' | 'operating' | 'conflict' | 'error';
    targetBranch: string;         // 原始目标分支（如 'origin/feature' 或 'feature'）
    localBranchName: string;      // 检出后的本地分支名
    willCreateLocal: boolean;     // 是否需要新建本地跟踪分支
    error: string | null;
  }>({
    phase: 'idle',
    targetBranch: '',
    localBranchName: '',
    willCreateLocal: false,
    error: null,
  });

  // 重置检出状态
  const resetCheckoutState = useCallback(() => {
    setCheckoutState({
      phase: 'idle',
      targetBranch: '',
      localBranchName: '',
      willCreateLocal: false,
      error: null,
    });
  }, []);

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

  // 跟踪分支 checkout（远程分支 → 自动创建本地跟踪分支）
  const checkoutRemoteMutation = useMutation({
    mutationFn: ({ remoteBranchName }: { remoteBranchName: string }) =>
      window.electronAPI.branch.checkoutRemote(repoPath, remoteBranchName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      resetCheckoutState();
    },
    onError: (err: any) => {
      const msg = String((err as any)?.message || err || '');
      setCheckoutState((prev) => ({
        ...prev,
        phase: 'error',
        error: msg,
      }));
    },
  });

  // 本地分支 checkout（直接切换）
  const checkoutLocalMutation = useMutation({
    mutationFn: ({ branchName }: { branchName: string }) =>
      window.electronAPI.branch.checkout(repoPath, branchName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      resetCheckoutState();
    },
    onError: (err: any) => {
      const msg = String((err as any)?.message || err || '');
      setCheckoutState((prev) => ({
        ...prev,
        phase: 'error',
        error: msg,
      }));
    },
  });

  // stash → checkout → pop（用于解决冲突）
  const checkoutWithStashMutation = useMutation({
    mutationFn: ({ branchName, remoteBranchName }: { branchName: string; remoteBranchName?: string }) =>
      window.electronAPI.branch.checkoutWithStash(repoPath, branchName, remoteBranchName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      resetCheckoutState();
    },
    onError: (err: any) => {
      const msg = String((err as any)?.message || err || '');
      setCheckoutState((prev) => ({
        ...prev,
        phase: 'error',
        error: msg,
      }));
    },
  });

  // discard → checkout（放弃修改后切换）
  const checkoutWithDiscardMutation = useMutation({
    mutationFn: ({ branchName, remoteBranchName }: { branchName: string; remoteBranchName?: string }) =>
      window.electronAPI.branch.checkoutWithDiscard(repoPath, branchName, remoteBranchName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      resetCheckoutState();
    },
    onError: (err: any) => {
      const msg = String((err as any)?.message || err || '');
      setCheckoutState((prev) => ({
        ...prev,
        phase: 'error',
        error: msg,
      }));
    },
  });

  const isOperating = checkoutRemoteMutation.isPending
    || checkoutLocalMutation.isPending
    || checkoutWithStashMutation.isPending
    || checkoutWithDiscardMutation.isPending;

  /**
   * 处理分支检出（远程或本地）
   * 1. 如果是远程分支 → 检查本地是否有跟踪分支
   * 2. 检查工作区是否干净
   * 3. 干净 → 直接检出
   * 4. 不干净 → 显示冲突对话框
   */
  const handleCheckout = useCallback(async (branch: SerializedBranch, isRemote: boolean) => {
    if (branch.name === currentBranch) return;

    if (isRemote) {
      // 远程分支：解析出本地分支名
      const parts = branch.name.split('/');
      const localName = parts.slice(1).join('/');

      // 查找本地是否有同名且已跟踪的分支
      const localTracking = branches.find(
        (b) => !b.remote && b.name === localName && b.tracking === branch.name
      );

      if (localTracking) {
        // 已有本地跟踪分支 → 直接切到本地分支
        setCheckoutState({
          phase: 'operating',
          targetBranch: branch.name,
          localBranchName: localName,
          willCreateLocal: false,
          error: null,
        });

        // 检查工作区是否干净
        const clean = await checkIsClean(repoPath);
        if (!clean) {
          setCheckoutState((prev) => ({
            ...prev,
            phase: 'conflict',
          }));
          return;
        }

        checkoutLocalMutation.mutate({ branchName: localName });
      } else {
        // 无本地跟踪分支 → 自动创建并跟踪
        setCheckoutState({
          phase: 'operating',
          targetBranch: branch.name,
          localBranchName: localName,
          willCreateLocal: true,
          error: null,
        });

        // 检查工作区是否干净
        const clean = await checkIsClean(repoPath);
        if (!clean) {
          setCheckoutState((prev) => ({
            ...prev,
            phase: 'conflict',
          }));
          return;
        }

        checkoutRemoteMutation.mutate({ remoteBranchName: branch.name });
      }
    } else {
      // 本地分支 → 直接切换
      setCheckoutState({
        phase: 'operating',
        targetBranch: branch.name,
        localBranchName: branch.name,
        willCreateLocal: false,
        error: null,
      });

      // 检查工作区是否干净
      const clean = await checkIsClean(repoPath);
      if (!clean) {
        setCheckoutState((prev) => ({
          ...prev,
          phase: 'conflict',
        }));
        return;
      }

      checkoutLocalMutation.mutate({ branchName: branch.name });
    }
  }, [branches, currentBranch, repoPath, checkoutLocalMutation, checkoutRemoteMutation]);

  // 冲突解决：暂存后切换
  const handleStashAndCheckout = useCallback(() => {
    const { targetBranch, localBranchName, willCreateLocal } = checkoutState;

    setCheckoutState((prev) => ({
      ...prev,
      phase: 'operating',
    }));

    if (willCreateLocal) {
      // 远程分支：stash + 创建跟踪分支 + 检出 + pop
      checkoutWithStashMutation.mutate({ branchName: localBranchName, remoteBranchName: targetBranch });
    } else {
      // 本地分支：stash + 检出 + pop
      checkoutWithStashMutation.mutate({ branchName: localBranchName });
    }
  }, [checkoutState, checkoutWithStashMutation]);

  // 冲突解决：放弃修改后切换
  const handleDiscardAndCheckout = useCallback(() => {
    const { targetBranch, localBranchName, willCreateLocal } = checkoutState;

    setCheckoutState((prev) => ({
      ...prev,
      phase: 'operating',
    }));

    if (willCreateLocal) {
      // 远程分支：reset + 创建跟踪分支 + 检出
      checkoutWithDiscardMutation.mutate({ branchName: localBranchName, remoteBranchName: targetBranch });
    } else {
      // 本地分支：reset + 检出
      checkoutWithDiscardMutation.mutate({ branchName: localBranchName });
    }
  }, [checkoutState, checkoutWithDiscardMutation]);

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
            onCheckout={() => handleCheckout(branch, false)}
            onDelete={() => deleteBranchMutation.mutate(branch.name)}
            onMerge={() => mergeBranchMutation.mutate(branch.name)}
          />
        ))}

        {/* 远程分支（按最后更新时间倒序排列） */}
        {remoteBranches.length > 0 && (
          <>
            <div className="px-3 py-2 text-xs text-gray-500 font-medium uppercase tracking-wider border-t border-gray-700 mt-2">
              远程分支
            </div>
            {[...remoteBranches]
              .sort((a, b) => (b.date || 0) - (a.date || 0))
              .map((branch) => {
              // 检查本地是否有同名跟踪分支，以及是否就是当前分支
              const localName = branch.name.split('/').slice(1).join('/');
              const isRemoteCurrent = !!(branch.remote && localName === currentBranch);
              const hasLocalTracking = branches.some(
                (b) => !b.remote && b.name === localName && b.tracking === branch.name
              );
              return (
                <BranchItem
                  key={branch.name}
                  branch={branch}
                  isCurrent={isRemoteCurrent}
                  hasLocalTracking={hasLocalTracking}
                  onCheckout={() => handleCheckout(branch, true)}
                  onDelete={undefined}
                  onMerge={undefined}
                />
              );
            })}
          </>
        )}
      </div>

      {/* 检出进度 / 冲突 / 错误对话框 */}
      {(checkoutState.phase !== 'idle') && (
        <CheckoutDialog
          targetBranch={checkoutState.targetBranch}
          localBranchName={checkoutState.localBranchName}
          willCreateLocal={checkoutState.willCreateLocal}
          isOperating={isOperating}
          error={checkoutState.error}
          onClose={resetCheckoutState}
          onCheckout={() => {
            // 从冲突状态重新尝试直接检出
            if (checkoutState.willCreateLocal) {
              checkoutRemoteMutation.mutate({ remoteBranchName: checkoutState.targetBranch });
            } else {
              checkoutLocalMutation.mutate({ branchName: checkoutState.localBranchName });
            }
          }}
          onStashAndCheckout={handleStashAndCheckout}
          onDiscardAndCheckout={handleDiscardAndCheckout}
        />
      )}
    </div>
  );
}

interface BranchItemProps {
  branch: SerializedBranch;
  isCurrent: boolean;
  hasLocalTracking?: boolean;   // 远程分支是否有本地跟踪分支
  onCheckout: (name: string) => void;
  onDelete?: () => void;
  onMerge?: () => void;
}

function BranchItem({ branch, isCurrent, hasLocalTracking, onCheckout, onDelete, onMerge }: BranchItemProps) {
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
          {/* 远程分支且有本地跟踪 → 标记为已跟踪 */}
          {branch.remote && hasLocalTracking && (
            <span className="text-xs bg-green-600/30 text-green-400 px-1.5 py-0.5 rounded">
              已跟踪
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

        <div className="text-xs text-gray-500 truncate flex items-center gap-2">
          {branch.commit?.slice(0, 8)}
          {branch.date && (
            <span className="text-gray-600">{formatRelativeTime(branch.date)}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isCurrent && (
          <>
            {branch.remote && !hasLocalTracking ? (
              /* 远程分支无本地跟踪 → 显示"检出"文字按钮 */
              <button
                onClick={() => onCheckout(branch.name)}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors"
                title="检出并自动跟踪远程分支"
              >
                检出
              </button>
            ) : (
              <button
                onClick={() => onCheckout(branch.name)}
                className="p-1 hover:bg-blue-900/30 rounded text-blue-400"
                title={branch.remote ? '切换到本地跟踪分支' : '切换到该分支'}
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
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