import { useState, useEffect } from 'react';
import { X, Upload } from 'lucide-react';
import type { SerializedRemote, SerializedBranch } from '../../types';

interface PushDialogProps {
  repoPath: string;
  currentBranch: string | null;
  isOperating: boolean;
  error: string | null;
  onClose: () => void;
  onPush: (remote: string, branch: string) => void;
}

export function PushDialog({ repoPath, currentBranch, isOperating, error, onClose, onPush }: PushDialogProps) {
  const [remotes, setRemotes] = useState<SerializedRemote[]>([]);
  const [branches, setBranches] = useState<SerializedBranch[]>([]);
  const [selectedRemote, setSelectedRemote] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // 加载远程仓库列表和本地分支列表
  useEffect(() => {
    (async () => {
      try {
        const [remoteList, branchList] = await Promise.all([
          window.electronAPI.remote.list(repoPath),
          window.electronAPI.branch.list(repoPath),
        ]);
        setRemotes(remoteList);
        // 推送：显示本地分支
        const localBranches = branchList.filter(b => !b.remote);
        setBranches(localBranches);
        // 默认选中第一个远程
        if (remoteList.length > 0) {
          setSelectedRemote(remoteList[0].name);
        }
        // 默认选中当前分支
        if (currentBranch) {
          setSelectedBranch(currentBranch);
        }
      } catch (err: any) {
        console.error('加载数据失败:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [repoPath, currentBranch]);

  const handlePush = () => {
    if (!selectedRemote || !selectedBranch) return;
    onPush(selectedRemote, selectedBranch);
  };

  return (
    <div className="fixed z-50" style={{ top: '68px', left: '20px', right: '20px' }}>
      <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl">
        {isOperating ? (
          // 推送中：显示进度条
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm text-gray-200 mb-3">
              <Upload className="w-4 h-4 animate-bounce" />
              正在推送 {selectedRemote}/{selectedBranch}...
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        ) : error ? (
          // 推送失败：显示错误 + 重试 + 关闭按钮
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-red-400">
                <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-xs">!</span>
                推送失败
              </div>
              <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="text-xs text-gray-300 bg-gray-900/60 rounded p-3 max-h-[200px] overflow-auto whitespace-pre-wrap">{error}</pre>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handlePush}
                disabled={!selectedRemote || !selectedBranch}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-xs font-medium transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                重试推送 {selectedRemote && selectedBranch ? `${selectedRemote}/${selectedBranch}` : ''}
              </button>
            </div>
          </div>
        ) : (
          // 选择界面
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-200">选择推送目标</h3>
              <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            {isLoading ? (
              <div className="text-center text-gray-400 text-sm py-2">加载中...</div>
            ) : remotes.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-2">未配置远程仓库</div>
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
                      <option key={b.name} value={b.name}>{b.name} {b.current ? '(当前)' : ''}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handlePush}
                  disabled={!selectedRemote || !selectedBranch}
                  className="flex items-center gap-1 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />推送
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}