import { Fragment } from 'react';
import { SerializedRepository } from '../../types';
import {
  GitBranch, Download, Upload, RefreshCw, Plus, FolderOpen, FileCode, Trash2, Menu,
  History, Tag, Archive, Globe,
} from 'lucide-react';
import { useState } from 'react';

type ViewMode = 'diff' | 'log' | 'tags' | 'stash' | 'remote' | 'branch';

interface HeaderProps {
  repos: SerializedRepository[];
  activeRepo: SerializedRepository;
  onSelectRepo: (repo: SerializedRepository) => void;
  onAddRepo: () => void;
  onCloneRepo: () => void;
  onInitRepo: () => void;
  onRemoveRepo: (id: string) => void;
  onPull: () => void;
  onPush: () => void;
  onFetch: () => void;
  onToggleBranch: () => void;
  isPulling: boolean;
  isPushing: boolean;
  isFetching: boolean;
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

interface ToolbarButtonProps {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
}

function ToolbarButton({ icon, label, active, onClick }: ToolbarButtonProps) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
      }`}>{icon}{label}</button>
  );
}

export function Header({
  repos, activeRepo, onSelectRepo, onAddRepo, onCloneRepo, onInitRepo, onRemoveRepo,
  onPull, onPush, onFetch, onToggleBranch, isPulling, isPushing, isFetching,
  activeView, onViewChange,
}: HeaderProps) {
  const [showRepoMenu, setShowRepoMenu] = useState(false);

  return (
    <header className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-2 flex-shrink-0">
      {/* Logo */}
      <FileCode className="w-5 h-5 text-blue-400 flex-shrink-0" />
      <span className="text-sm text-blue-400 font-bold mr-1 hidden md:inline">eSource</span>

      {/* 仓库选择器 */}
      <div className="relative">
        <button onClick={() => setShowRepoMenu(!showRepoMenu)}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors max-w-[160px]">
          <FolderOpen className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{activeRepo.name}</span>
          <Menu className="w-3 h-3 text-gray-400" />
        </button>
        {showRepoMenu && (
          <Fragment>
            <div className="fixed inset-0 z-10" onClick={() => setShowRepoMenu(false)} />
            <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 fade-in">
              <div className="p-1">
                {repos.map((repo) => (
                  <div key={repo.id} onClick={() => { onSelectRepo(repo); setShowRepoMenu(false); }}
                    className={`group flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm ${repo.id === activeRepo.id ? 'bg-blue-900/40 text-blue-300' : 'text-gray-300 hover:bg-gray-700'}`}>
                    <FolderOpen className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0"><div className="truncate">{repo.name}</div><div className="text-xs text-gray-500 truncate">{repo.path}</div></div>
                    <button onClick={(e) => { e.stopPropagation(); onRemoveRepo(repo.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-900/50 rounded"><Trash2 className="w-3 h-3 text-red-400" /></button>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-700 p-1">
                <button onClick={() => { onAddRepo(); setShowRepoMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded"><FolderOpen className="w-4 h-4" />添加已有仓库</button>
                <button onClick={() => { onCloneRepo(); setShowRepoMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded"><Download className="w-4 h-4" />克隆仓库</button>
                <button onClick={() => { onInitRepo(); setShowRepoMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded"><Plus className="w-4 h-4" />初始化仓库</button>
              </div>
            </div>
          </Fragment>
        )}
      </div>

      <div className="w-px h-6 bg-gray-700 flex-shrink-0" />

      {/* 当前分支 */}
      <button onClick={onToggleBranch}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors flex-shrink-0" title="切换分支">
        <GitBranch className="w-4 h-4 text-green-400" />
        <span className="max-w-[100px] truncate">{activeRepo.currentBranch}</span>
      </button>

      <div className="w-px h-6 bg-gray-700 flex-shrink-0" />

      {/* 远程操作按钮 */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onFetch} disabled={isFetching}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-700 rounded transition-colors disabled:opacity-50" title="获取（Fetch）">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /><span className="hidden md:inline">获取</span>
        </button>
        <button onClick={onPull} disabled={isPulling}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-700 rounded transition-colors disabled:opacity-50" title="拉取（Pull）">
          <Download className={`w-3.5 h-3.5 ${isPulling ? 'animate-bounce' : ''}`} /><span className="hidden md:inline">拉取</span>
        </button>
        <button onClick={onPush} disabled={isPushing}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-700 rounded transition-colors disabled:opacity-50" title="推送（Push）">
          <Upload className={`w-3.5 h-3.5 ${isPushing ? 'animate-bounce' : ''}`} /><span className="hidden md:inline">推送</span>
        </button>
      </div>

      <div className="w-px h-6 bg-gray-700 flex-shrink-0" />

      {/* 仓库状态（在视图切换按钮之前） */}
      <div className="flex items-center gap-2 text-xs text-gray-500 flex-shrink-0">
        {!activeRepo.isClean && <span className="flex items-center gap-1 text-yellow-400"><span className="w-2 h-2 rounded-full bg-yellow-400" />有变更</span>}
        {activeRepo.ahead > 0 && <span className="text-green-400">领先 {activeRepo.ahead}</span>}
        {activeRepo.behind > 0 && <span className="text-red-400">落后 {activeRepo.behind}</span>}
      </div>

      {/* 视图切换按钮（推送到最右侧） */}
      <div className="ml-auto flex items-center gap-1">
        <ToolbarButton icon={<GitBranch className="w-3.5 h-3.5" />} label="分支" active={activeView === 'branch'} onClick={() => onViewChange(activeView === 'branch' ? 'diff' : 'branch')} />
        <ToolbarButton icon={<History className="w-3.5 h-3.5" />} label="历史" active={activeView === 'log'} onClick={() => onViewChange(activeView === 'log' ? 'diff' : 'log')} />
        <ToolbarButton icon={<Tag className="w-3.5 h-3.5" />} label="标签" active={activeView === 'tags'} onClick={() => onViewChange(activeView === 'tags' ? 'diff' : 'tags')} />
        <ToolbarButton icon={<Archive className="w-3.5 h-3.5" />} label="Stash" active={activeView === 'stash'} onClick={() => onViewChange(activeView === 'stash' ? 'diff' : 'stash')} />
        <ToolbarButton icon={<Globe className="w-3.5 h-3.5" />} label="远程" active={activeView === 'remote'} onClick={() => onViewChange(activeView === 'remote' ? 'diff' : 'remote')} />
      </div>
    </header>
  );
}