import { Fragment } from 'react';
import { SerializedRepository } from '../../types';
import {
  GitBranch,
  GitPullRequest,
  Download,
  Upload,
  RefreshCw,
  Plus,
  FolderOpen,
  FileCode,
  List,
  Trash2,
  Menu,
} from 'lucide-react';
import { useState } from 'react';

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
}

export function Header({
  repos,
  activeRepo,
  onSelectRepo,
  onAddRepo,
  onCloneRepo,
  onInitRepo,
  onRemoveRepo,
  onPull,
  onPush,
  onFetch,
  onToggleBranch,
  isPulling,
  isPushing,
  isFetching,
}: HeaderProps) {
  const [showRepoMenu, setShowRepoMenu] = useState(false);

  return (
    <header className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-3 flex-shrink-0">
      {/* 仓库选择器 */}
      <div className="relative">
        <button
          onClick={() => setShowRepoMenu(!showRepoMenu)}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors max-w-[200px]"
        >
          <FolderOpen className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{activeRepo.name}</span>
          <Menu className="w-3 h-3 text-gray-400" />
        </button>

        {showRepoMenu && (
          <Fragment>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowRepoMenu(false)}
            />
            <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 fade-in">
              <div className="p-1">
                {repos.map((repo) => (
                  <div
                    key={repo.id}
                    onClick={() => {
                      onSelectRepo(repo);
                      setShowRepoMenu(false);
                    }}
                    className={`group flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm ${
                      repo.id === activeRepo.id
                        ? 'bg-blue-900/40 text-blue-300'
                        : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <FolderOpen className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{repo.name}</div>
                      <div className="text-xs text-gray-500 truncate">{repo.path}</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveRepo(repo.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-900/50 rounded"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-700 p-1">
                <button
                  onClick={() => {
                    onAddRepo();
                    setShowRepoMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded"
                >
                  <FolderOpen className="w-4 h-4" />
                  添加已有仓库
                </button>
                <button
                  onClick={() => {
                    onCloneRepo();
                    setShowRepoMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded"
                >
                  <Download className="w-4 h-4" />
                  克隆仓库
                </button>
                <button
                  onClick={() => {
                    onInitRepo();
                    setShowRepoMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded"
                >
                  <Plus className="w-4 h-4" />
                  初始化仓库
                </button>
              </div>
            </div>
          </Fragment>
        )}
      </div>

      {/* 分隔线 */}
      <div className="w-px h-6 bg-gray-700" />

      {/* 当前分支 */}
      <button
        onClick={onToggleBranch}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
        title="切换分支"
      >
        <GitBranch className="w-4 h-4 text-green-400" />
        <span className="max-w-[120px] truncate">{activeRepo.currentBranch}</span>
      </button>

      {/* 分隔线 */}
      <div className="w-px h-6 bg-gray-700" />

      {/* 远程操作按钮 */}
      <div className="flex items-center gap-1">
        <button
          onClick={onFetch}
          disabled={isFetching}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
          title="获取（Fetch）"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">获取</span>
        </button>
        <button
          onClick={onPull}
          disabled={isPulling}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
          title="拉取（Pull）"
        >
          <Download className={`w-4 h-4 ${isPulling ? 'animate-bounce' : ''}`} />
          <span className="hidden md:inline">拉取</span>
        </button>
        <button
          onClick={onPush}
          disabled={isPushing}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
          title="推送（Push）"
        >
          <Upload className={`w-4 h-4 ${isPushing ? 'animate-bounce' : ''}`} />
          <span className="hidden md:inline">推送</span>
        </button>
      </div>

      {/* 右侧：仓库状态 */}
      <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
        {!activeRepo.isClean && (
          <span className="flex items-center gap-1 text-yellow-400">
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            有变更
          </span>
        )}
        {activeRepo.ahead > 0 && (
          <span className="text-green-400">
            领先 {activeRepo.ahead}
          </span>
        )}
        {activeRepo.behind > 0 && (
          <span className="text-red-400">
            落后 {activeRepo.behind}
          </span>
        )}
      </div>
    </header>
  );
}