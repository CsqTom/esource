import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  SerializedRepository,
  SerializedBranch,
  SerializedDiff,
  FileChangeItem,
} from './types';
import { RepoList } from './components/repo/RepoList';
import { CloneDialog } from './components/repo/CloneDialog';
import { BranchPanel } from './components/branch/BranchPanel';
import { FileList } from './components/workdir/FileList';
import { DiffViewer } from './components/diff/DiffViewer';
import { Header } from './components/layout/Header';
import { StatusBar } from './components/layout/StatusBar';
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Download,
  Upload,
  RefreshCw,
  Plus,
  FolderOpen,
  FileCode,
} from 'lucide-react';

export default function App() {
  const queryClient = useQueryClient();
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [showBranchPanel, setShowBranchPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<'staged' | 'unstaged' | 'all'>('all');

  // ── 仓库列表 ──
  const { data: repos = [], isLoading: reposLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: () => window.electronAPI.repo.list(),
    staleTime: 3_000,
  });

  const activeRepo = repos.find((r) => r.id === activeRepoId) || repos[0] || null;

  // ── 工作区状态 ──
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['status', activeRepo?.path],
    queryFn: () => window.electronAPI.workdir.status(activeRepo!.path),
    enabled: !!activeRepo?.path,
    staleTime: 2_000,
    refetchInterval: 5_000,
  });

  // ── 分支列表 ──
  const { data: branches = [] } = useQuery({
    queryKey: ['branches', activeRepo?.path],
    queryFn: () => window.electronAPI.branch.list(activeRepo!.path),
    enabled: !!activeRepo?.path,
    staleTime: 5_000,
  });

  // ── Diff ──
  const { data: diff, isLoading: diffLoading } = useQuery({
    queryKey: ['diff', activeRepo?.path, selectedFile],
    queryFn: () => {
      if (!selectedFile) return null;
      const isStaged = activeTab === 'staged';
      return window.electronAPI.workdir.diff(activeRepo!.path, selectedFile, isStaged);
    },
    enabled: !!activeRepo?.path && !!selectedFile,
    staleTime: 30_000,
  });

  // ── 变更文件列表（组装） ──
  const fileChanges: FileChangeItem[] = (() => {
    if (!status) return [];
    const items: FileChangeItem[] = [];

    // 已暂存的文件
    for (const f of status.staged) {
      // 检查是否在 modified/created/deleted 中
      if (status.modified.includes(f)) {
        items.push({ path: f, status: 'modified', staged: true });
      } else if (status.created.includes(f)) {
        items.push({ path: f, status: 'added', staged: true });
      } else if (status.deleted.includes(f)) {
        items.push({ path: f, status: 'deleted', staged: true });
      } else {
        items.push({ path: f, status: 'modified', staged: true });
      }
    }

    // 未暂存的修改
    for (const f of status.modified) {
      if (!status.staged.includes(f)) {
        items.push({ path: f, status: 'modified', staged: false });
      }
    }

    // 未暂存的新增
    for (const f of status.not_added) {
      items.push({ path: f, status: 'untracked', staged: false });
    }

    // 冲突
    for (const f of status.conflicted) {
      const existing = items.findIndex((i) => i.path === f);
      if (existing >= 0) {
        items[existing] = { ...items[existing], status: 'conflicted' };
      } else {
        items.push({ path: f, status: 'conflicted', staged: false });
      }
    }

    // 删除（未暂存）
    for (const f of status.deleted) {
      if (!status.staged.includes(f)) {
        items.push({ path: f, status: 'deleted', staged: false });
      }
    }

    // 重命名
    for (const r of status.renamed) {
      const existing = items.findIndex((i) => i.path === r.to);
      if (existing >= 0) {
        items[existing] = { ...items[existing], oldPath: r.from };
      } else {
        items.push({ path: r.to, status: 'modified', staged: true, oldPath: r.from });
      }
    }

    return items;
  })();

  // 过滤后的文件列表
  const filteredFiles = fileChanges.filter((f) => {
    if (activeTab === 'staged') return f.staged;
    if (activeTab === 'unstaged') return !f.staged;
    return true;
  });

  // ── Mutations ──
  const checkoutMutation = useMutation({
    mutationFn: (branchName: string) =>
      window.electronAPI.branch.checkout(activeRepo!.path, branchName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] });
      queryClient.invalidateQueries({ queryKey: ['branches', activeRepo?.path] });
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
  });

  const stageMutation = useMutation({
    mutationFn: (files: string[]) =>
      window.electronAPI.workdir.stage(activeRepo!.path, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] });
    },
  });

  const unstageMutation = useMutation({
    mutationFn: (files: string[]) =>
      window.electronAPI.workdir.unstage(activeRepo!.path, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] });
    },
  });

  const discardMutation = useMutation({
    mutationFn: (files: string[]) =>
      window.electronAPI.workdir.discard(activeRepo!.path, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] });
      setSelectedFile(null);
    },
  });

  const commitMutation = useMutation({
    mutationFn: (message: string) =>
      window.electronAPI.workdir.commit(activeRepo!.path, message),
    onSuccess: () => {
      setCommitMessage('');
      queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] });
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
  });

  const pullMutation = useMutation({
    mutationFn: () => window.electronAPI.remote.pull(activeRepo!.path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] });
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
  });

  const pushMutation = useMutation({
    mutationFn: () => window.electronAPI.remote.push(activeRepo!.path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
  });

  const fetchMutation = useMutation({
    mutationFn: () => window.electronAPI.remote.fetch(activeRepo!.path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
  });

  const handleAddRepo = useCallback(async () => {
    try {
      await window.electronAPI.repo.add();
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    } catch (err: any) {
      if (err.message !== '用户取消了选择') {
        console.error('添加仓库失败:', err);
      }
    }
  }, [queryClient]);

  const handleInitRepo = useCallback(async () => {
    try {
      await window.electronAPI.repo.init();
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    } catch (err: any) {
      if (err.message !== '用户取消了选择') {
        console.error('初始化仓库失败:', err);
      }
    }
  }, [queryClient]);

  const handleClone = useCallback(
    async (url: string, destPath: string) => {
      await window.electronAPI.repo.clone(url, destPath);
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
    [queryClient]
  );

  const handleRemoveRepo = useCallback(
    async (id: string) => {
      await window.electronAPI.repo.remove(id);
      if (activeRepoId === id) {
        setActiveRepoId(null);
        setSelectedFile(null);
      }
      queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
    [queryClient, activeRepoId]
  );

  const handleStageAll = useCallback(() => {
    stageMutation.mutate(['.']);
  }, [stageMutation]);

  const handleUnstageAll = useCallback(() => {
    unstageMutation.mutate(['.']);
  }, [unstageMutation]);

  const handleCommit = useCallback(() => {
    if (!commitMessage.trim()) return;
    commitMutation.mutate(commitMessage);
  }, [commitMessage, commitMutation]);

  const handleFileClick = useCallback((file: FileChangeItem) => {
    setSelectedFile(file.path);
  }, []);

  const handleStageFile = useCallback(
    (file: string) => {
      stageMutation.mutate([file]);
    },
    [stageMutation]
  );

  const handleUnstageFile = useCallback(
    (file: string) => {
      unstageMutation.mutate([file]);
    },
    [unstageMutation]
  );

  const handleDiscardFile = useCallback(
    (file: string) => {
      discardMutation.mutate([file]);
    },
    [discardMutation]
  );

  // 如果还没有仓库，显示欢迎页面
  if (!reposLoading && repos.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-900 text-gray-100">
        <FileCode className="w-16 h-16 text-blue-400 mb-4" />
        <h1 className="text-2xl font-bold mb-2">欢迎使用 eSource</h1>
        <p className="text-gray-400 mb-8">选择一个 Git 仓库开始使用</p>
        <div className="flex gap-4">
          <button
            onClick={handleAddRepo}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            添加已有仓库
          </button>
          <button
            onClick={() => setShowCloneDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            克隆仓库
          </button>
          <button
            onClick={handleInitRepo}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            初始化仓库
          </button>
        </div>
        {showCloneDialog && (
          <CloneDialog
            onClose={() => setShowCloneDialog(false)}
            onClone={handleClone}
          />
        )}
      </div>
    );
  }

  if (!activeRepo) return null;

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      {/* Header */}
      <Header
        repos={repos}
        activeRepo={activeRepo}
        onSelectRepo={(repo) => {
          setActiveRepoId(repo.id);
          setSelectedFile(null);
          setShowBranchPanel(false);
        }}
        onAddRepo={handleAddRepo}
        onCloneRepo={() => setShowCloneDialog(true)}
        onInitRepo={handleInitRepo}
        onRemoveRepo={handleRemoveRepo}
        onPull={pullMutation.mutate}
        onPush={pushMutation.mutate}
        onFetch={fetchMutation.mutate}
        onToggleBranch={() => setShowBranchPanel(!showBranchPanel)}
        isPulling={pullMutation.isPending}
        isPushing={pushMutation.isPending}
        isFetching={fetchMutation.isPending}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧仓库列表 */}
        <div className="w-60 border-r border-gray-700 overflow-y-auto flex-shrink-0">
          <RepoList
            repos={repos}
            activeRepoId={activeRepo.id}
            onSelectRepo={(repo) => {
              setActiveRepoId(repo.id);
              setSelectedFile(null);
            }}
            onRemoveRepo={handleRemoveRepo}
          />
        </div>

        {/* 中间区域：文件变更列表 */}
        <div className="w-96 border-r border-gray-700 flex flex-col flex-shrink-0">
          {/* Tab 切换 */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'all'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              全部 ({fileChanges.length})
            </button>
            <button
              onClick={() => setActiveTab('staged')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'staged'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              已暂存 ({fileChanges.filter((f) => f.staged).length})
            </button>
            <button
              onClick={() => setActiveTab('unstaged')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'unstaged'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              未暂存 ({fileChanges.filter((f) => !f.staged).length})
            </button>
          </div>

          {/* 暂存/取消暂存全部按钮 */}
          <div className="flex gap-1 px-2 py-1 border-b border-gray-700 bg-gray-800/50">
            <button
              onClick={handleStageAll}
              className="flex items-center gap-1 px-2 py-1 text-xs text-green-400 hover:bg-green-900/30 rounded transition-colors"
              title="暂存全部"
            >
              <Plus className="w-3 h-3" /> 全部暂存
            </button>
            <button
              onClick={handleUnstageAll}
              className="flex items-center gap-1 px-2 py-1 text-xs text-orange-400 hover:bg-orange-900/30 rounded transition-colors"
              title="取消暂存全部"
            >
              <RefreshCw className="w-3 h-3" /> 取消暂存
            </button>
          </div>

          {/* 文件列表 */}
          <div className="flex-1 overflow-y-auto">
            <FileList
              files={filteredFiles}
              selectedFile={selectedFile}
              onFileClick={handleFileClick}
              onStageFile={handleStageFile}
              onUnstageFile={handleUnstageFile}
              onDiscardFile={handleDiscardFile}
            />
          </div>

          {/* 提交面板 */}
          <div className="border-t border-gray-700 p-3 bg-gray-800/50">
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="提交信息..."
              className="w-full bg-gray-700 text-gray-100 rounded px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleCommit();
                }
              }}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">
                {fileChanges.filter((f) => f.staged).length} 个文件待提交
              </span>
              <button
                onClick={handleCommit}
                disabled={
                  commitMutation.isPending ||
                  !commitMessage.trim() ||
                  fileChanges.filter((f) => f.staged).length === 0
                }
                className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
              >
                <GitCommit className="w-3.5 h-3.5" />
                提交
              </button>
            </div>
          </div>
        </div>

        {/* 右侧：Diff 视图 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {showBranchPanel ? (
            <BranchPanel
              branches={branches}
              currentBranch={activeRepo.currentBranch}
              onCheckout={(branch) => checkoutMutation.mutate(branch)}
              onClose={() => setShowBranchPanel(false)}
              repoPath={activeRepo.path}
            />
          ) : selectedFile && diff ? (
            <DiffViewer diff={diff} loading={diffLoading} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>选择一个文件查看变更内容</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        repoPath={activeRepo.path}
        currentBranch={activeRepo.currentBranch}
        ahead={activeRepo.ahead}
        behind={activeRepo.behind}
        isClean={activeRepo.isClean}
      />

      {/* Clone Dialog */}
      {showCloneDialog && (
        <CloneDialog
          onClose={() => setShowCloneDialog(false)}
          onClone={handleClone}
        />
      )}
    </div>
  );
}