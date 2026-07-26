import { useState, useEffect } from 'react';
import { X, Download, Archive, Trash2, GitBranch, AlertCircle } from 'lucide-react';
import type { SerializedRemote, SerializedBranch } from '../../types';

interface PullProgressDialogProps {
  repoPath: string;
  trackingBranch: string | null; // 跟踪分支（如 'origin/master'），为null时显示选择器
  isOperating: boolean;
  error: string | null;
  onClose: () => void;
  onPull: (remote: string, branch: string) => void; // 拉取指定远程分支
  onStashAndPull?: (remote: string, branch: string) => void;
  onDiscardAndPull?: (remote: string, branch: string) => void;
}

export function PullProgressDialog({
  repoPath,
  trackingBranch,
  isOperating,
  error,
  onClose,
  onPull,
  onStashAndPull,
  onDiscardAndPull
}: PullProgressDialogProps) {
  const [remotes, setRemotes] = useState<SerializedRemote[]>([]);
  const [branches, setBranches] = useState<SerializedBranch[]>([]);
  const [selectedRemote, setSelectedRemote] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const hasTracking = !!trackingBranch;

  // 从跟踪分支解析远程和分支名（用于有跟踪分支时）
  const parsedTracking = hasTracking ? {
    remote: trackingBranch.split('/')[0],
    branch: trackingBranch.split('/').slice(1).join('/')
  } : null;

  // 如果没有跟踪分支，加载远程仓库列表和远程分支列表
  useEffect(() => {
    if (hasTracking) {
      // 有跟踪分支时，设置selectedRemote和selectedBranch
      if (parsedTracking) {
        setSelectedRemote(parsedTracking.remote);
        setSelectedBranch(parsedTracking.branch);
      }
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const [remoteList, branchList] = await Promise.all([
          window.electronAPI.remote.list(repoPath),
          window.electronAPI.branch.list(repoPath),
        ]);
        setRemotes(remoteList);
        // 拉取：显示远程分支
        const remoteBranches = branchList.filter(b => b.remote);
        setBranches(remoteBranches);
        // 默认选中第一个远程
        if (remoteList.length > 0) {
          setSelectedRemote(remoteList[0].name);
        }
        // 默认选中第一个远程分支
        if (remoteBranches.length > 0) {
          setSelectedBranch(remoteBranches[0].name);
        }
      } catch (err: any) {
        console.error('加载数据失败:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [repoPath, hasTracking, parsedTracking]);

  const handlePull = () => {
    if (!selectedRemote || !selectedBranch) return;
    // 从远程分支名中提取纯分支名（去掉远程前缀）
    // 例如：'esource/master' -> 'master'
    const branchName = selectedBranch.includes('/') ? selectedBranch.split('/').slice(1).join('/') : selectedBranch;
    onPull(selectedRemote, branchName);
  };

  const handleStashAndPull = () => {
    if (!selectedRemote || !selectedBranch) return;
    // 从远程分支名中提取纯分支名（去掉远程前缀）
    const branchName = selectedBranch.includes('/') ? selectedBranch.split('/').slice(1).join('/') : selectedBranch;
    onStashAndPull?.(selectedRemote, branchName);
  };

  const handleDiscardAndPull = () => {
    if (!selectedRemote || !selectedBranch) return;
    // 从远程分支名中提取纯分支名（去掉远程前缀）
    const branchName = selectedBranch.includes('/') ? selectedBranch.split('/').slice(1).join('/') : selectedBranch;
    onDiscardAndPull?.(selectedRemote, branchName);
  };

  return (
    <div className="fixed z-50" style={{ top: '68px', left: '20px', right: '20px' }}>
      <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl">
        {isOperating ? (
          // 拉取中：显示进度条
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm text-gray-200 mb-3">
              <Download className="w-4 h-4 animate-pulse" />
              正在拉取 {selectedRemote && selectedBranch ? `${selectedRemote}/${selectedBranch}` : '...'}...
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        ) : error ? (
          // 拉取失败：显示错误 + 关闭按钮 + 冲突解决选项
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-red-400">
                <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-xs">!</span>
                拉取失败
              </div>
              <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="text-xs text-gray-300 bg-gray-900/60 rounded p-3 max-h-[200px] overflow-auto whitespace-pre-wrap">{error}</pre>
            {/* 如果是拉取冲突错误，显示解决选项 */}
            {error.includes('would be overwritten by merge') && (onStashAndPull || onDiscardAndPull) && (
              <div className="mt-3 flex items-center gap-2">
                {onStashAndPull && (
                  <button
                    onClick={handleStashAndPull}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-xs font-medium transition-colors"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    暂存后拉取
                  </button>
                )}
                {onDiscardAndPull && (
                  <button
                    onClick={handleDiscardAndPull}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-xs font-medium transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    放弃本地修改并拉取
                  </button>
                )}
              </div>
            )}
          </div>
        ) : !hasTracking ? (
          // 无跟踪分支：显示选择界面
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-200">选择拉取目标</h3>
              <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            {isLoading ? (
              <div className="text-center text-gray-400 text-sm py-2">加载中...</div>
            ) : remotes.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-2">未配置远程仓库</div>
            ) : branches.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-2">未找到远程分支</div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <select
                    value={selectedRemote}
                    onChange={(e) => setSelectedRemote(e.target.value)}
                    className="w-full bg-gray-700 text-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {remotes.map((r) => (
                      <option key={r.name} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <span className="text-gray-500">/</span>
                <div className="flex-1">
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full bg-gray-700 text-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {branches.map((b) => (
                      <option key={b.name} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handlePull}
                  disabled={!selectedRemote || !selectedBranch}
                  className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />拉取
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// src/components/branch/CheckoutDialog.tsx

interface CheckoutDialogProps {
  targetBranch: string;           // 目标分支（如 'origin/feature' 或 'feature'）
  localBranchName: string;        // 本地分支名（如 'feature'，用于显示）
  willCreateLocal: boolean;       // 是否会新建本地跟踪分支
  isOperating: boolean;           // 是否正在切换
  error: string | null;           // 错误信息
  onClose: () => void;
  onCheckout: () => void;               // 直接切换（工作区干净时不会走到这里）
  onStashAndCheckout: () => void;       // 暂存后切换
  onDiscardAndCheckout: () => void;     // 放弃修改后切换
}

export function CheckoutDialog({
  targetBranch,
  localBranchName,
  willCreateLocal,
  isOperating,
  error,
  onClose,
  onStashAndCheckout,
  onDiscardAndCheckout,
}: CheckoutDialogProps) {
  return (
    <div className="fixed z-50" style={{ top: '68px', left: '20px', right: '20px' }}>
      <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl">
        {isOperating ? (
          /* 切换中：进度条 */
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm text-gray-200 mb-3">
              <GitBranch className="w-4 h-4 animate-pulse" />
              正在切换到 {localBranchName}...
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        ) : error ? (
          /* 切换失败：显示错误 */
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-red-400">
                <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-xs">!</span>
                切换失败
              </div>
              <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="text-xs text-gray-300 bg-gray-900/60 rounded p-3 max-h-[200px] overflow-auto whitespace-pre-wrap">{error}</pre>
          </div>
        ) : (
          /* 工作区有修改：选择处理方式 */
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400" />
                <h3 className="text-sm font-medium text-gray-200">工作区有未提交的修改</h3>
              </div>
              <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 目标分支信息 */}
            <div className="mb-3 text-xs text-gray-400 bg-gray-900/40 rounded p-2">
              {willCreateLocal ? (
                <>将创建本地分支 <span className="text-blue-400">{localBranchName}</span> 并跟踪 <span className="text-gray-300">{targetBranch}</span></>
              ) : (
                <>切换到分支 <span className="text-blue-400">{localBranchName}</span></>
              )}
            </div>

            {/* 三个操作选项 */}
            <div className="flex items-center gap-2">
              <button
                onClick={onStashAndCheckout}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-xs font-medium transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
                暂存后切换
              </button>
              <button
                onClick={onDiscardAndCheckout}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-xs font-medium transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                放弃修改并切换
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}