import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SerializedRepository, FileChangeItem } from './types';
import { RepoList } from './components/repo/RepoList';
import { CloneDialog } from './components/repo/CloneDialog';
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
import { GitBranch, GitCommit, Download, Upload, RefreshCw, Plus, FolderOpen, FileCode, History, Tag, Archive, Globe } from 'lucide-react';

type ViewMode = 'diff' | 'log' | 'tags' | 'stash' | 'remote' | 'branch';

export default function App() {
  const queryClient = useQueryClient();
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [activeView, setActiveView] = useState<ViewMode>('diff');
  const [activeTab, setActiveTab] = useState<'staged' | 'unstaged'>('unstaged');

  const { data: repos = [], isLoading: reposLoading } = useQuery({ queryKey: ['repos'], queryFn: () => window.electronAPI.repo.list(), staleTime: 3_000 });
  const activeRepo = repos.find((r) => r.id === activeRepoId) || repos[0] || null;

  const { data: status } = useQuery({ queryKey: ['status', activeRepo?.path], queryFn: () => window.electronAPI.workdir.status(activeRepo!.path), enabled: !!activeRepo?.path, staleTime: 2_000, refetchInterval: 5_000 });
  const { data: branches = [] } = useQuery({ queryKey: ['branches', activeRepo?.path], queryFn: () => window.electronAPI.branch.list(activeRepo!.path), enabled: !!activeRepo?.path, staleTime: 5_000 });

  const { data: diff, isFetching: diffLoading } = useQuery({
    queryKey: ['diff', activeRepo?.path, selectedFile, activeTab],
    queryFn: async () => { if (!selectedFile) return null; return window.electronAPI.workdir.diff(activeRepo!.path, selectedFile, activeTab === 'staged'); },
    enabled: !!activeRepo?.path && !!selectedFile && activeView === 'diff',
    staleTime: 30_000, placeholderData: (prev) => prev,
  });

  // 判断文件是否为未跟踪：检查 status.not_added 或 status.files 中的 working_dir
  const isSelectedFileUntracked = !!(selectedFile && (
    status?.not_added?.includes(selectedFile) ||
    status?.files?.some(f => f.path === selectedFile && f.working_dir?.trim() === '?')
  ));

  const ext = selectedFile?.split('.').pop()?.toLowerCase() || '';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext);
  const { data: untrackedContent } = useQuery({
    queryKey: ['fileContent', activeRepo?.path, selectedFile, isImage],
    queryFn: async () => {
      if (!selectedFile || !activeRepo?.path) return '';
      if (isImage) { return window.electronAPI.workdir.readFile(activeRepo.path, selectedFile, true); }
      return window.electronAPI.workdir.readFile(activeRepo.path, selectedFile, false);
    },
    enabled: !!activeRepo?.path && !!selectedFile && isSelectedFileUntracked,
    staleTime: 10_000,
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

  const filteredFiles = fileChanges.filter((f) => { if (activeTab === 'staged') return f.staged; return !f.staged; });

  const checkoutMutation = useMutation({ mutationFn: (branchName: string) => window.electronAPI.branch.checkout(activeRepo!.path, branchName), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }); queryClient.invalidateQueries({ queryKey: ['branches', activeRepo?.path] }); queryClient.invalidateQueries({ queryKey: ['repos'] }); } });
  const stageMutation = useMutation({ mutationFn: (files: string[]) => window.electronAPI.workdir.stage(activeRepo!.path, files), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }) });
  const unstageMutation = useMutation({ mutationFn: (files: string[]) => window.electronAPI.workdir.unstage(activeRepo!.path, files), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }) });
  const discardMutation = useMutation({ mutationFn: (files: string[]) => window.electronAPI.workdir.discard(activeRepo!.path, files), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }); setSelectedFile(null); } });
  const commitMutation = useMutation({ mutationFn: (message: string) => window.electronAPI.workdir.commit(activeRepo!.path, message), onSuccess: () => { setCommitMessage(''); queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }); queryClient.invalidateQueries({ queryKey: ['repos'] }); } });
  const pullMutation = useMutation({ mutationFn: () => window.electronAPI.remote.pull(activeRepo!.path), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }); queryClient.invalidateQueries({ queryKey: ['repos'] }); } });
  const pushMutation = useMutation({ mutationFn: () => window.electronAPI.remote.push(activeRepo!.path), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repos'] }) });
  const fetchMutation = useMutation({ mutationFn: () => window.electronAPI.remote.fetch(activeRepo!.path), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repos'] }) });

  const handleAddRepo = useCallback(async () => { try { await window.electronAPI.repo.add(); queryClient.invalidateQueries({ queryKey: ['repos'] }); } catch (err: any) { if (err.message !== '用户取消了选择') console.error('添加仓库失败:', err); } }, [queryClient]);
  const handleInitRepo = useCallback(async () => { try { await window.electronAPI.repo.init(); queryClient.invalidateQueries({ queryKey: ['repos'] }); } catch (err: any) { if (err.message !== '用户取消了选择') console.error('初始化仓库失败:', err); } }, [queryClient]);
  const handleClone = useCallback(async (url: string, destPath: string) => { await window.electronAPI.repo.clone(url, destPath); queryClient.invalidateQueries({ queryKey: ['repos'] }); }, [queryClient]);
  const handleRemoveRepo = useCallback(async (id: string) => { await window.electronAPI.repo.remove(id); if (activeRepoId === id) { setActiveRepoId(null); setSelectedFile(null); } queryClient.invalidateQueries({ queryKey: ['repos'] }); }, [queryClient, activeRepoId]);
  const handleStageAll = useCallback(() => stageMutation.mutate(['.']), [stageMutation]);
  const handleUnstageAll = useCallback(() => unstageMutation.mutate(['.']), [unstageMutation]);
  const handleCommit = useCallback(() => { if (!commitMessage.trim()) return; commitMutation.mutate(commitMessage); }, [commitMessage, commitMutation]);
  const handleFileClick = useCallback((file: FileChangeItem) => { setSelectedFile(file.path); setActiveView('diff'); }, []);
  const handleStageFile = useCallback((file: string) => stageMutation.mutate([file]), [stageMutation]);
  const handleUnstageFile = useCallback((file: string) => unstageMutation.mutate([file]), [unstageMutation]);
  const handleDiscardFile = useCallback((file: string) => discardMutation.mutate([file]), [discardMutation]);

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
      <Header repos={repos} activeRepo={activeRepo} onSelectRepo={(repo) => { setActiveRepoId(repo.id); setSelectedFile(null); }}
        onAddRepo={handleAddRepo} onCloneRepo={() => setShowCloneDialog(true)} onInitRepo={handleInitRepo} onRemoveRepo={handleRemoveRepo}
        onPull={pullMutation.mutate} onPush={pushMutation.mutate} onFetch={fetchMutation.mutate}
        onToggleBranch={() => setActiveView(activeView === 'branch' ? 'diff' : 'branch')}
        isPulling={pullMutation.isPending} isPushing={pushMutation.isPending} isFetching={fetchMutation.isPending} />
      <div className="flex-1 flex overflow-hidden">
        <div className="w-60 border-r border-gray-700 overflow-y-auto flex-shrink-0">
          <RepoList repos={repos} activeRepoId={activeRepo.id} onSelectRepo={(repo) => { setActiveRepoId(repo.id); setSelectedFile(null); }} onRemoveRepo={handleRemoveRepo} />
        </div>
        <div className="w-96 border-r border-gray-700 flex flex-col flex-shrink-0">
          <div className="flex border-b border-gray-700">
            <button onClick={() => setActiveTab('staged')} className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${activeTab === 'staged' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200'}`}>已暂存 ({fileChanges.filter((f) => f.staged).length})</button>
            <button onClick={() => setActiveTab('unstaged')} className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${activeTab === 'unstaged' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200'}`}>未暂存 ({fileChanges.filter((f) => !f.staged).length})</button>
          </div>
          <div className="flex gap-1 px-2 py-1 border-b border-gray-700 bg-gray-800/50">
            <button onClick={handleStageAll} className="flex items-center gap-1 px-2 py-1 text-xs text-green-400 hover:bg-green-900/30 rounded" title="暂存全部"><Plus className="w-3 h-3" /> 全部暂存</button>
            <button onClick={handleUnstageAll} className="flex items-center gap-1 px-2 py-1 text-xs text-orange-400 hover:bg-orange-900/30 rounded" title="取消暂存全部"><RefreshCw className="w-3 h-3" /> 取消暂存</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <FileList files={filteredFiles} selectedFile={selectedFile} onFileClick={handleFileClick} onStageFile={handleStageFile} onUnstageFile={handleUnstageFile} onDiscardFile={handleDiscardFile} />
          </div>
          <div className="border-t border-gray-700 p-3 bg-gray-800/50">
            <textarea value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="提交信息..." className="w-full bg-gray-700 text-gray-100 rounded px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommit(); }} />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">{fileChanges.filter((f) => f.staged).length} 个文件待提交</span>
              <button onClick={handleCommit} disabled={commitMutation.isPending || !commitMessage.trim() || fileChanges.filter((f) => f.staged).length === 0} className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"><GitCommit className="w-3.5 h-3.5" />提交</button>
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">{renderView()}</div>
      </div>
      <div className="h-10 bg-gray-800 border-t border-gray-700 flex items-center px-2 gap-1 flex-shrink-0">
        <ToolbarButton icon={<GitBranch className="w-4 h-4" />} label="分支" active={activeView === 'branch'} onClick={() => setActiveView(activeView === 'branch' ? 'diff' : 'branch')} />
        <ToolbarButton icon={<History className="w-4 h-4" />} label="日志" active={activeView === 'log'} onClick={() => setActiveView(activeView === 'log' ? 'diff' : 'log')} />
        <ToolbarButton icon={<Tag className="w-4 h-4" />} label="标签" active={activeView === 'tags'} onClick={() => setActiveView(activeView === 'tags' ? 'diff' : 'tags')} />
        <ToolbarButton icon={<Archive className="w-4 h-4" />} label="Stash" active={activeView === 'stash'} onClick={() => setActiveView(activeView === 'stash' ? 'diff' : 'stash')} />
        <ToolbarButton icon={<Globe className="w-4 h-4" />} label="远程" active={activeView === 'remote'} onClick={() => setActiveView(activeView === 'remote' ? 'diff' : 'remote')} />
        <div className="flex-1" />
        <span className="text-xs text-gray-500">{activeRepo.name} / {activeRepo.currentBranch}</span>
      </div>
      <StatusBar repoPath={activeRepo.path} currentBranch={activeRepo.currentBranch} ahead={activeRepo.ahead} behind={activeRepo.behind} isClean={activeRepo.isClean} />
      {showCloneDialog && <CloneDialog onClose={() => setShowCloneDialog(false)} onClone={handleClone} />}
    </div>
  );

  function renderView() {
    switch (activeView) {
      case 'log': return <LogViewer repoPath={activeRepo.path} onClose={() => setActiveView('diff')} />;
      case 'tags': return <TagPanel repoPath={activeRepo.path} onClose={() => setActiveView('diff')} />;
      case 'stash': return <StashPanel repoPath={activeRepo.path} onClose={() => setActiveView('diff')} />;
      case 'remote': return <RemotePanel repoPath={activeRepo.path} onClose={() => setActiveView('diff')} />;
      case 'branch': return <BranchPanel branches={branches} currentBranch={activeRepo.currentBranch} onCheckout={(branch) => checkoutMutation.mutate(branch)} onClose={() => setActiveView('diff')} repoPath={activeRepo.path} />;
      case 'diff':
      default:
        if (selectedFile && diff) {
          if (activeTab === 'staged') {
            return <DiffStageView diff={diff} loading={diffLoading} repoPath={activeRepo.path} onActionComplete={() => { queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }); queryClient.invalidateQueries({ queryKey: ['diff', activeRepo?.path, selectedFile] }); }} />;
          } else {
            return <DiffUnstageView diff={diff} loading={diffLoading} repoPath={activeRepo.path} isUntracked={isSelectedFileUntracked} untrackedContent={untrackedContent} untrackedContentBase64={isImage ? untrackedContent : undefined} onActionComplete={() => { queryClient.invalidateQueries({ queryKey: ['status', activeRepo?.path] }); queryClient.invalidateQueries({ queryKey: ['diff', activeRepo?.path, selectedFile] }); }} />;
          }
        }
        return (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center"><GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>选择一个文件查看变更内容</p><p className="text-xs mt-2">或使用底部工具栏查看其他视图</p></div>
          </div>
        );
    }
  }
}

interface ToolbarButtonProps { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; }
function ToolbarButton({ icon, label, active, onClick }: ToolbarButtonProps) {
  return <button onClick={onClick} className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}>{icon}{label}</button>;
}