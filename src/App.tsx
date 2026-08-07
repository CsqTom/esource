import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { FileChangeItem } from './types';
import { RepoList } from './components/repo/RepoList';
import { CloneDialog } from './components/repo/CloneDialog';
import { PullProgressDialog } from './components/remote/PullProgressDialog';
import { CredentialDialog } from './components/remote/CredentialDialog';
import { PushDialog } from './components/remote/PushDialog';
import { BranchPanel } from './components/branch/BranchPanel';
import { FileList } from './components/workdir/FileList';
import { DiffStageView } from './components/diff/DiffStageView';
import { DiffUnstageView } from './components/diff/DiffUnstageView';
import { LogViewer } from './components/log/LogViewer';
import { TagPanel } from './components/tag/TagPanel';
import { StashPanel } from './components/stash/StashPanel';
import { RemotePanel } from './components/remote/RemotePanel';
import { Header } from './components/layout/Header';
import { StatusBar } from './components/layout/StatusBar';
import { ResizableDivider } from './components/common/ResizableDivider';
import { GitBranch, GitCommit, Download, RefreshCw, Plus, FolderOpen, FileCode } from 'lucide-react';

type ViewMode = 'diff' | 'log' | 'tags' | 'stash' | 'remote' | 'branch';

export default function App() {
  const queryClient = useQueryClient();
  const [activeRepoId, setActiveRepoId] = useState<string | null>(() => {
    try { return localStorage.getItem('lastActiveRepoId'); } catch { return null; }
  });
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]); // 多选文件列表
  // 提交草稿按仓库区分，避免不同项目互相影响
  const [commitDrafts, setCommitDrafts] = useState<Record<string, string>>({});
  const [activeView, setActiveView] = useState<ViewMode>('diff');
  // 从标签页跳转到提交历史时，要定位/选中的提交 hash
  const [logFocusHash, setLogFocusHash] = useState<string | undefined>(undefined);
  // 当前选中文件是否为已暂存状态（同一 path 可能同时存在于 staged/unstaged，用此区分）
  const [selectedFileStaged, setSelectedFileStaged] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [showPullProgress, setShowPullProgress] = useState(false);
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [credentialUrl, setCredentialUrl] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  // 保存凭据后自动重试的待定操作
  const [credentialPendingAction, setCredentialPendingAction] = useState<{
    type: 'pull' | 'push' | 'fetch';
    remote?: string;
    branch?: string;
  } | null>(null);
  // 用于 Shift 范围选择
  const lastClickedIndexRef = useRef<number | null>(null);

  // 文件面板宽度（可拖动调整，水平方向）
  const filePanelDivider = ResizableDivider({
    initialSize: 384, // w-96 = 384px
    minSize: 150, // 最小宽度调小，支持更窄的视图
    maxSize: 600,
    direction: 'left',
  });
  // 文件面板内"已暂存/未暂存"上下分区的拖动分隔条（垂直方向）
  const stagedPanelDivider = ResizableDivider({
    initialSize: 200, // 已暂存区初始高度
    minSize: 60, // 最小高度，保证标题可见
    maxSize: 100000, // 不设上限，允许未暂存区缩到约 1 行
    orientation: 'vertical',
  });

  const { data: repos = [], isLoading: reposLoading } = useQuery({ queryKey: ['repos'], queryFn: () => window.electronAPI.repo.list(), staleTime: 3_000 });
  const activeRepo = repos.find((r) => r.id === activeRepoId) || repos[0] || null;

  const { data: status } = useQuery({ queryKey: ['status', activeRepo?.path], queryFn: () => window.electronAPI.workdir.status(activeRepo!.path), enabled: !!activeRepo?.path, staleTime: 2_000, refetchInterval: 5_000 });
  const { data: branches = [] } = useQuery({ queryKey: ['branches', activeRepo?.path], queryFn: () => window.electronAPI.branch.list(activeRepo!.path), enabled: !!activeRepo?.path, staleTime: 5_000 });

  // 从 git 当前分支读取最近 10 条提交记录（用于提交框快速选择）
  const { data: recentMessages = [] } = useQuery({ queryKey: ['recentMessages', activeRepo?.path], queryFn: () => window.electronAPI.log.recentMessages(activeRepo!.path), enabled: !!activeRepo?.path, staleTime: 2_000 });

  const { data: diff, isFetching: diffLoading } = useQuery({
    queryKey: ['diff', activeRepo?.path, selectedFile, selectedFileStaged],
    queryFn: async () => { if (!selectedFile) return null; return window.electronAPI.workdir.diff(activeRepo!.path, selectedFile, selectedFileStaged); },
    enabled: !!activeRepo?.path && !!selectedFile && activeView === 'diff',
    staleTime: 30_000, placeholderData: (prev) => prev,
  });

  const isSelectedFileUntracked = !!(selectedFile && (
    status?.not_added?.includes(selectedFile) ||
    status?.files?.some(f => f.path === selectedFile && f.working_dir?.trim() === '?')
  ));

  const ext = selectedFile?.split('.').pop()?.toLowerCase() || '';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext);

  // 获取文件大小（仅非图片的未跟踪文件）
  const { data: fileSize = 0 } = useQuery({
    queryKey: ['fileSize', activeRepo?.path, selectedFile],
    queryFn: async () => { if (!selectedFile || !activeRepo?.path) return 0; return window.electronAPI.workdir.getFileSize(activeRepo.path, selectedFile); },
    enabled: !!activeRepo?.path && !!selectedFile && isSelectedFileUntracked && !isImage,
    staleTime: 10_000,
  });
  const isFileTooLarge = !isImage && isSelectedFileUntracked && fileSize > 1024 * 1024; // 超过 1MB

  const { data: untrackedContent } = useQuery({
    queryKey: ['fileContent', activeRepo?.path, selectedFile, isImage],
    queryFn: async () => {
      if (!selectedFile || !activeRepo?.path) return '';
      if (isImage) { return window.electronAPI.workdir.readFile(activeRepo.path, selectedFile, true); }
      return window.electronAPI.workdir.readFile(activeRepo.path, selectedFile, false);
    },
    enabled: !!activeRepo?.path && !!selectedFile && isSelectedFileUntracked && !isFileTooLarge, staleTime: 10_000,
  });

  const fileChanges: FileChangeItem[] = (() => {
    if (!status || !status.files) return [];
    const items: FileChangeItem[] = [];
    for (const f of status.files) {
      const idx = (f.index || ' ').trim(); const wd = (f.working_dir || ' ').trim();
      const isStaged = idx === 'M' || idx === 'A' || idx === 'D' || idx === 'R' || idx === 'C';
      const isUnstaged = wd === 'M' || wd === 'D' || wd === '?';
      if (wd === '?') { items.push({ path: f.path, status: 'untracked', staged: false }); }
      else {
        if (isStaged) {
          if (idx === 'A') items.push({ path: f.path, status: 'added', staged: true });
          else if (idx === 'D') items.push({ path: f.path, status: 'deleted', staged: true });
          else items.push({ path: f.path, status: 'modified', staged: true });
        }
        if (isUnstaged) {
          if (wd === 'D') items.push({ path: f.path, status: 'deleted', staged: false });
          else items.push({ path: f.path, status: 'modified', staged: false });
        }
      }
    }
    return items;
  })();

  // 上下分区：分别取出已暂存与未暂存文件，避免 Tab 来回切换
  const stagedFiles = fileChanges.filter((f) => f.staged);
  const unstagedFiles = fileChanges.filter((f) => !f.staged);

  const stageMutation = useMutation({ mutationFn: (files: string[]) => window.electronAPI.workdir.stage(activeRepo!.path, files), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }) });
  const unstageMutation = useMutation({ mutationFn: (files: string[]) => window.electronAPI.workdir.unstage(activeRepo!.path, files), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }) });
  const discardMutation = useMutation({ mutationFn: (files: string[]) => window.electronAPI.workdir.discard(activeRepo!.path, files), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }); setSelectedFile(null); } });
  // 提交：成功后清空当前仓库草稿，刷新最近提交记录
  const commitMutation = useMutation({
    mutationFn: (message: string) => window.electronAPI.workdir.commit(activeRepo!.path, message),
    onSuccess: (_data, _message) => {
      // 清空当前仓库草稿
      if (activeRepo) setCommitDrafts(prev => { const next = { ...prev }; delete next[activeRepo.id]; return next; });
      queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] });
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      queryClient.invalidateQueries({ queryKey: ['recentMessages', activeRepo?.path] });
    },
  });
  // 拉取/推送/获取：操作成功后刷新状态与仓库列表（更新 ahead/behind）
  const invalidateRepoState = () => { queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }); queryClient.invalidateQueries({ queryKey: ['repos'] }); };
  // 拉取：支持手动选择远程分支或使用跟踪分支
  const pullMutation = useMutation({
    mutationFn: ({ remote, branch }: { remote: string; branch: string }) => window.electronAPI.remote.pull(activeRepo!.path, remote, branch),
    onSuccess: () => { invalidateRepoState(); setShowPullProgress(false); setPullError(null); },
    onError: (err, variables) => {
      const msg = String((err as any)?.message || err || '').replace(/^Error: Error invoking remote method 'remote:pull': Error: /, '');
      setPullError(msg);
      // 认证错误时弹出凭据对话框并记录待定操作
      if (/authentication failed|could not read username|could not read password|terminal prompts disabled|401|403/i.test(msg)) {
        setCredentialUrl(activeRepo?.remoteUrl || '');
        setCredentialError(msg);
        setCredentialPendingAction({ type: 'pull', remote: variables.remote, branch: variables.branch });
      }
    },
  });
  const handlePull = useCallback((remote: string, branch: string) => { setPullError(null); pullMutation.mutate({ remote, branch }); }, [pullMutation]);
  // stash后拉取：支持手动选择远程分支或使用跟踪分支
  const pullWithStashMutation = useMutation({
    mutationFn: ({ remote, branch }: { remote: string; branch: string }) => window.electronAPI.remote.pullWithStash(activeRepo!.path, remote, branch),
    onSuccess: () => { invalidateRepoState(); setShowPullProgress(false); setPullError(null); },
    onError: (err) => {
      setPullError(String((err as any)?.message || err || '').replace(/^Error: Error invoking remote method 'remote:pullWithStash': Error: /, ''));
    },
  });
  const handleStashAndPull = useCallback((remote: string, branch: string) => { setPullError(null); pullWithStashMutation.mutate({ remote, branch }); }, [pullWithStashMutation]);
  // 放弃本地修改后拉取：支持手动选择远程分支或使用跟踪分支
  const pullWithDiscardMutation = useMutation({
    mutationFn: ({ remote, branch }: { remote: string; branch: string }) => window.electronAPI.remote.pullWithDiscard(activeRepo!.path, remote, branch),
    onSuccess: () => { invalidateRepoState(); setShowPullProgress(false); setPullError(null); },
    onError: (err) => {
      setPullError(String((err as any)?.message || err || '').replace(/^Error: Error invoking remote method 'remote:pullWithDiscard': Error: /, ''));
    },
  });
  const handleDiscardAndPull = useCallback((remote: string, branch: string) => { setPullError(null); pullWithDiscardMutation.mutate({ remote, branch }); }, [pullWithDiscardMutation]);
  // 推送：通过弹窗选择远程和分支，成功自动关闭，失败显示错误
  const pushMutation = useMutation({
    mutationFn: ({ remote, branch }: { remote: string; branch: string }) => window.electronAPI.remote.push(activeRepo!.path, remote, branch),
    onSuccess: () => { invalidateRepoState(); setShowPushDialog(false); setSelectedFile(null); queryClient.invalidateQueries({ queryKey: ['diff', activeRepo?.path] }); },
    onError: (err, variables) => {
      const msg = String((err as any)?.message || err || '');
      if (/authentication failed|could not read username|could not read password|terminal prompts disabled|401|403/i.test(msg)) {
        setCredentialUrl(activeRepo?.remoteUrl || '');
        setCredentialError(msg);
        setCredentialPendingAction({ type: 'push', remote: variables.remote, branch: variables.branch });
      }
    },
  });
  const handlePush = useCallback((remote: string, branch: string) => pushMutation.mutate({ remote, branch }), [pushMutation]);
  const pushError = pushMutation.isError ? String(pushMutation.error?.message || pushMutation.error || '').replace(/^Error: Error invoking remote method 'remote:push': Error: /, '') : null;
  const fetchMutation = useMutation({
    mutationFn: () => window.electronAPI.remote.fetch(activeRepo!.path),
    onSuccess: invalidateRepoState,
    onError: (err) => {
      const msg = String((err as any)?.message || err || '');
      if (/authentication failed|could not read username|could not read password|terminal prompts disabled|401|403/i.test(msg)) {
        setCredentialUrl(activeRepo?.remoteUrl || '');
        setCredentialError(msg);
        setCredentialPendingAction({ type: 'fetch' });
      }
      console.error('获取失败:', err);
    },
  });

  // 凭据对话框：保存后自动重试挂起的操作
  const handleCredentialSave = useCallback(async (url: string, username: string, password: string) => {
    if (!activeRepo) return;
    // 查找匹配 URL 的远程名，否则默认 origin
    let remote = 'origin';
    try {
      const remotes = await window.electronAPI.remote.list(activeRepo.path);
      const matched = remotes.find(r => r.refs.fetch === url || r.refs.push === url);
      if (matched) remote = matched.name;
    } catch {}
    await window.electronAPI.git.setCredential(activeRepo.path, remote, url, username, password);
    setCredentialUrl(null);
    setCredentialError(null);
    // 保存凭据后自动重试之前失败的操作
    const pending = credentialPendingAction;
    setCredentialPendingAction(null);
    if (pending) {
      if (pending.type === 'pull') {
        setPullError(null);
        setShowPullProgress(true);
        pullMutation.mutate({ remote: pending.remote!, branch: pending.branch! });
      } else if (pending.type === 'push') {
        pushMutation.mutate({ remote: pending.remote!, branch: pending.branch! });
      } else if (pending.type === 'fetch') {
        fetchMutation.mutate();
      }
    }
    // 刷新仓库状态
    queryClient.invalidateQueries({ queryKey: ['status', activeRepo.path] });
    queryClient.invalidateQueries({ queryKey: ['remotes', activeRepo.path] });
    queryClient.invalidateQueries({ queryKey: ['repos'] });
  }, [activeRepo, queryClient, credentialPendingAction, pullMutation, pushMutation, fetchMutation]);

  
  // 自动获取：启动时获取一次，之后每 5 分钟定时获取（不使用 mutation，避免依赖循环）
  useEffect(() => {
    if (!activeRepo) return;
    let mounted = true;
    const doFetch = async () => {
      try {
        await window.electronAPI.remote.fetch(activeRepo.path);
        if (mounted) invalidateRepoState();
      } catch (err) {
        console.error('自动获取失败:', err);
      }
    };
    // 启动时获取一次
    doFetch();
    // 定时获取（每 5 分钟）
    const interval = setInterval(doFetch, 5 * 60 * 1000);
    return () => { mounted = false; clearInterval(interval); };
  }, [activeRepo?.path]); // 仅当仓库切换时重新设置

  const handleAddRepo = useCallback(async () => {
    try {
      const repo = await window.electronAPI.repo.add();
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      // 切到新添加的仓库
      setActiveRepoId(repo.id);
      try { localStorage.setItem('lastActiveRepoId', repo.id); } catch {}
    } catch (err: any) {
      if (err.message !== '用户取消了选择') console.error('添加仓库失败:', err);
    }
  }, [queryClient]);
  const handleInitRepo = useCallback(async () => {
    try {
      const repo = await window.electronAPI.repo.init();
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      // 切到新初始化的仓库
      setActiveRepoId(repo.id);
      try { localStorage.setItem('lastActiveRepoId', repo.id); } catch {}
    } catch (err: any) {
      if (err.message !== '用户取消了选择') console.error('初始化仓库失败:', err);
    }
  }, [queryClient]);
  const handleClone = useCallback(async (url: string, destPath: string) => {
    const repo = await window.electronAPI.repo.clone(url, destPath);
    queryClient.invalidateQueries({ queryKey: ['repos'] });
    // 切到新克隆的仓库
    setActiveRepoId(repo.id);
    try { localStorage.setItem('lastActiveRepoId', repo.id); } catch {}
  }, [queryClient]);
  const handleSelectRepo = useCallback((repoId: string) => {
    setActiveRepoId(repoId);
    setSelectedFile(null);
    try { localStorage.setItem('lastActiveRepoId', repoId); } catch {}
  }, []);

  const handleRemoveRepo = useCallback(async (id: string) => { await window.electronAPI.repo.remove(id); if (activeRepoId === id) { setActiveRepoId(null); try { localStorage.removeItem('lastActiveRepoId'); } catch {} setSelectedFile(null); } queryClient.invalidateQueries({ queryKey: ['repos'] }); }, [queryClient, activeRepoId]);
  const handleStageAll = useCallback(() => stageMutation.mutate(['.']), [stageMutation]);
  const handleUnstageAll = useCallback(() => unstageMutation.mutate(['.']), [unstageMutation]);
  // 获取/设置当前仓库的提交草稿
  const commitMessage = activeRepo ? (commitDrafts[activeRepo.id] || '') : '';
  const setCommitMessage = (msg: string) => { if (activeRepo) setCommitDrafts(prev => ({ ...prev, [activeRepo.id]: msg })); };
  const handleCommit = useCallback(() => { if (!commitMessage.trim()) return; commitMutation.mutate(commitMessage); }, [commitMessage, commitMutation]);

  // 文件点击：处理单选/多选逻辑
  const handleFileClick = useCallback((file: FileChangeItem, e?: React.MouseEvent) => {
    const currentFiles = stagedFiles.concat(unstagedFiles);
    const idx = currentFiles.findIndex(f => f.path === file.path);

    if (e && (e.ctrlKey || e.metaKey)) {
      // Ctrl+Click：切换选中状态
      e.stopPropagation();
      setSelectedFiles(prev => {
        if (prev.includes(file.path)) {
          return prev.filter(p => p !== file.path);
        } else {
          return [...prev, file.path];
        }
      });
    } else if (e && e.shiftKey && lastClickedIndexRef.current !== null) {
      // Shift+Click：范围选择
      e.stopPropagation();
      const lastIdx = lastClickedIndexRef.current;
      if (idx !== -1 && lastIdx !== null) {
        const start = Math.min(lastIdx, idx);
        const end = Math.max(lastIdx, idx);
        const rangeFiles = currentFiles.slice(start, end + 1).map(f => f.path);
        setSelectedFiles(prev => Array.from(new Set([...prev, ...rangeFiles])));
      }
    } else {
      // 普通点击：清空多选，单选
      setSelectedFiles([file.path]);
      lastClickedIndexRef.current = null;
    }

    // 更新最后点击的索引（用于后续 Shift 范围选择）
    if (idx !== -1) {
      lastClickedIndexRef.current = idx;
    }

    // 无论哪种点击，都更新当前查看的文件
    setSelectedFile(file.path);
    setSelectedFileStaged(file.staged);
    setActiveView('diff');
  }, [stagedFiles, unstagedFiles]);

  // 暂存/取消暂存/丢弃：如果有多选文件，则对所有选中文件执行操作
  const handleStageFile = useCallback((file: string) => {
    if (selectedFiles.length > 1) {
      stageMutation.mutate(selectedFiles);
    } else {
      stageMutation.mutate([file]);
    }
  }, [stageMutation, selectedFiles]);

  const handleUnstageFile = useCallback((file: string) => {
    if (selectedFiles.length > 1) {
      unstageMutation.mutate(selectedFiles);
    } else {
      unstageMutation.mutate([file]);
    }
  }, [unstageMutation, selectedFiles]);

  const handleDiscardFile = useCallback((file: string) => {
    if (selectedFiles.length > 1) {
      discardMutation.mutate(selectedFiles);
    } else {
      discardMutation.mutate([file]);
    }
  }, [discardMutation, selectedFiles]);

  if (!reposLoading && repos.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-900 text-gray-100">
        <FileCode className="w-16 h-16 text-blue-400 mb-4" />
        <h1 className="text-2xl font-bold mb-2">欢迎使用 eSource</h1>
        <p className="text-gray-400 mb-8">选择一个 Git 仓库开始使用</p>
        <div className="flex gap-4">
          <button onClick={handleAddRepo} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg"><FolderOpen className="w-4 h-4" />添加已有仓库</button>
          <button onClick={() => setShowCloneDialog(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg"><Download className="w-4 h-4" />克隆仓库</button>
          <button onClick={handleInitRepo} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"><Plus className="w-4 h-4" />初始化仓库</button>
        </div>
        {showCloneDialog && <CloneDialog onClose={() => setShowCloneDialog(false)} onClone={handleClone} />}
      </div>
    );
  }
  if (!activeRepo) return null;

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      <Header repos={repos} activeRepo={activeRepo} onSelectRepo={(repo) => { handleSelectRepo(repo.id); }}
        onAddRepo={handleAddRepo} onCloneRepo={() => setShowCloneDialog(true)} onInitRepo={handleInitRepo} onRemoveRepo={handleRemoveRepo}
        onPull={() => {
          // 显示拉取进度面板
          setPullError(null);
          setShowPullProgress(true);
          // 如果有跟踪分支，自动拉取
          if (status?.tracking) {
            const [remote, ...branchParts] = status.tracking.split('/');
            pullMutation.mutate({ remote, branch: branchParts.join('/') });
          }
          // 否则让用户选择远程分支
        }} onPush={() => setShowPushDialog(true)} onFetch={fetchMutation.mutate}
        onToggleBranch={() => setActiveView(activeView === 'branch' ? 'diff' : 'branch')}
        isPulling={pullMutation.isPending} isPushing={pushMutation.isPending} isFetching={fetchMutation.isPending}
        activeView={activeView} onViewChange={setActiveView}
        sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <div className="flex-1 flex overflow-hidden">
        {!sidebarCollapsed && (
        <div className="w-60 border-r border-gray-700 overflow-y-auto flex-shrink-0">
          <RepoList repos={repos} activeRepoId={activeRepo.id} onSelectRepo={(repo) => { handleSelectRepo(repo.id); setSidebarCollapsed(true); }} onRemoveRepo={handleRemoveRepo} />
        </div>
        )}
        <div style={{ width: filePanelDivider.width }} className="border-r border-gray-700 flex flex-col flex-shrink-0">
          {/* 上：已暂存区（固定高度，可由分隔条调整） */}
          <div style={{ height: stagedPanelDivider.size }} className="flex flex-col min-h-0 flex-shrink-0">
            <div className="flex items-center px-3 py-1.5 bg-gray-800/80 border-b border-gray-700 flex-shrink-0">
              <span className="text-xs font-medium text-blue-400">已暂存 ({stagedFiles.length})</span>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => { setSelectedFiles(stagedFiles.map(f => f.path)); unstageMutation.mutate(stagedFiles.map(f => f.path)); }} className="flex items-center gap-1 px-2 py-0.5 text-xs text-orange-400 border border-orange-900/50 hover:bg-orange-900/30 rounded" title="取消所有暂存"><RefreshCw className="w-3 h-3" /> 取消所有暂存</button>
                <button onClick={() => { if (selectedFiles.length > 0) unstageMutation.mutate(selectedFiles); }} className="flex items-center gap-1 px-2 py-0.5 text-xs text-orange-400 border border-orange-900/50 hover:bg-orange-900/30 rounded" title="取消选定暂存">取消选定暂存</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {stagedFiles.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-600 text-xs">没有已暂存文件</div>
              ) : (
                <FileList
                  files={stagedFiles}
                  selectedFiles={selectedFiles}
                  onFileClick={handleFileClick}
                  onStageFile={handleStageFile}
                  onUnstageFile={handleUnstageFile}
                  onDiscardFile={handleDiscardFile}
                  repoPath={activeRepo.path}
                  onRefreshStatus={() => queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] })}
                />
              )}
            </div>
          </div>
          {/* 上下分区拖动分隔条 */}
          <div {...stagedPanelDivider.dividerProps} />
          {/* 下：未暂存区（自适应剩余高度） */}
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center px-3 py-1.5 bg-gray-800/80 border-b border-gray-700 flex-shrink-0">
              <span className="text-xs font-medium text-gray-300">未暂存 ({unstagedFiles.length})</span>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => { setSelectedFiles(unstagedFiles.map(f => f.path)); stageMutation.mutate(unstagedFiles.map(f => f.path)); }} className="flex items-center gap-1 px-2 py-0.5 text-xs text-green-400 border border-green-900/50 hover:bg-green-900/30 rounded" title="暂存所有未暂存文件"><Plus className="w-3 h-3" /> 暂存所有</button>
                <button onClick={() => { if (selectedFiles.length > 0) stageMutation.mutate(selectedFiles); }} className="flex items-center gap-1 px-2 py-0.5 text-xs text-green-400 border border-green-900/50 hover:bg-green-900/30 rounded" title="暂存所选文件">暂存所选</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {unstagedFiles.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-600 text-xs">没有未暂存文件</div>
              ) : (
                <FileList
                  files={unstagedFiles}
                  selectedFiles={selectedFiles}
                  onFileClick={handleFileClick}
                  onStageFile={handleStageFile}
                  onUnstageFile={handleUnstageFile}
                  onDiscardFile={handleDiscardFile}
                  repoPath={activeRepo.path}
                  onRefreshStatus={() => queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] })}
                />
              )}
            </div>
          </div>
          <div className="border-t border-gray-700 p-3 bg-gray-800/50">
            {/* 最近提交选择器：全局共用，选中填充到提交框 */}
            {recentMessages.length > 0 && (
              <div className="mb-2">
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) setCommitMessage(e.target.value); e.target.value = ''; }}
                  className="w-full bg-gray-700 text-gray-400 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-500 cursor-pointer"
                >
                  <option value="" disabled>选择最近提交...</option>
                  {recentMessages.map((msg, i) => (
                    <option key={i} value={msg}>{msg.length > 50 ? msg.slice(0, 50) + '...' : msg}</option>
                  ))}
                </select>
              </div>
            )}
            <textarea value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="提交信息..." className="w-full bg-gray-700 text-gray-100 rounded px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommit(); }} />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">{fileChanges.filter((f) => f.staged).length} 个文件待提交</span>
              <button onClick={handleCommit} disabled={commitMutation.isPending || !commitMessage.trim() || fileChanges.filter((f) => f.staged).length === 0} className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"><GitCommit className="w-3.5 h-3.5" />提交</button>
            </div>
          </div>
        </div>
        {/* 可拖动分隔条：调整暂存区宽度 */}
        <div {...filePanelDivider.dividerProps} />
        <div className="flex-1 flex flex-col overflow-hidden">{renderView()}</div>
      </div>
      <StatusBar repoPath={activeRepo.path} currentBranch={activeRepo.currentBranch} ahead={activeRepo.ahead} behind={activeRepo.behind} isClean={activeRepo.isClean} />
      {showCloneDialog && <CloneDialog onClose={() => setShowCloneDialog(false)} onClone={handleClone} />}
      {/* 拉取进度面板：有跟踪分支时自动拉取，无跟踪分支时让用户选择 */}
      {showPullProgress && activeRepo && (
        <PullProgressDialog
          repoPath={activeRepo.path}
          trackingBranch={status?.tracking || null}
          isOperating={pullMutation.isPending || pullWithStashMutation.isPending || pullWithDiscardMutation.isPending}
          error={pullError}
          onClose={() => { setShowPullProgress(false); setPullError(null); }}
          onPull={handlePull}
          onStashAndPull={handleStashAndPull}
          onDiscardAndPull={handleDiscardAndPull}
        />
      )}
      {/* 推送弹窗：选择远程仓库和分支，成功自动关闭，失败显示错误 */}
      {showPushDialog && activeRepo && (
        <PushDialog
          repoPath={activeRepo.path}
          currentBranch={activeRepo.currentBranch}
          isOperating={pushMutation.isPending}
          error={pushError}
          onClose={() => { setShowPushDialog(false); pushMutation.reset(); }}
          onPush={handlePush}
        />
      )}
      {/* 凭据对话框：git 认证失败时弹出 */}
      {credentialUrl && (
        <CredentialDialog
          url={credentialUrl}
          errorMessage={credentialError || ''}
          onClose={() => { setCredentialUrl(null); setCredentialError(null); setCredentialPendingAction(null); }}
          onSave={handleCredentialSave}
        />
      )}
    </div>
  );

  function renderView() {
    switch (activeView) {
      case 'log':
        return <LogViewer repoPath={activeRepo.path} onClose={() => setActiveView('diff')} focusHash={logFocusHash} />;
      case 'tags':
        return <TagPanel repoPath={activeRepo.path} onClose={() => setActiveView('diff')} currentBranch={activeRepo.currentBranch} onViewCommitHistory={(hash) => { setLogFocusHash(hash); setActiveView('log'); }} />;
      case 'stash': return <StashPanel repoPath={activeRepo.path} onClose={() => setActiveView('diff')} />;
      case 'remote': return <RemotePanel repoPath={activeRepo.path} onClose={() => setActiveView('diff')} />;
      case 'branch': return <BranchPanel branches={branches} currentBranch={activeRepo.currentBranch} onClose={() => setActiveView('diff')} repoPath={activeRepo.path} />;
      case 'diff':
      default:
        if (selectedFile && diff) {
          if (selectedFileStaged) {
            return <DiffStageView diff={diff} loading={diffLoading} repoPath={activeRepo.path} onActionComplete={() => { queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }); queryClient.invalidateQueries({ queryKey: ['diff', activeRepo?.path, selectedFile, selectedFileStaged] }); }} />;
          } else {
            return <DiffUnstageView diff={diff} loading={diffLoading} repoPath={activeRepo.path} isUntracked={isSelectedFileUntracked} untrackedContent={untrackedContent} untrackedContentBase64={isImage ? untrackedContent : undefined} isFileTooLarge={isFileTooLarge} onActionComplete={() => { queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }); queryClient.invalidateQueries({ queryKey: ['diff', activeRepo?.path, selectedFile, selectedFileStaged] }); }} />;
          }
        }
        return (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center"><GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>选择一个文件查看变更内容</p></div>
          </div>
        );
    }
  }
}