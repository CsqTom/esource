import { SerializedRepository } from '../../types';
import { GitBranch, FolderOpen, Trash2 } from 'lucide-react';

interface RepoListProps {
  repos: SerializedRepository[];
  activeRepoId: string;
  onSelectRepo: (repo: SerializedRepository) => void;
  onRemoveRepo: (id: string) => void;
}

export function RepoList({ repos, activeRepoId, onSelectRepo, onRemoveRepo }: RepoListProps) {
  return (
    <div className="py-1">
      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        仓库
      </div>
      {repos.map((repo) => (
        <div
          key={repo.id}
          onClick={() => onSelectRepo(repo)}
          className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
            repo.id === activeRepoId
              ? 'bg-blue-900/30 text-blue-300 border-l-2 border-blue-500'
              : 'text-gray-300 hover:bg-gray-800 border-l-2 border-transparent'
          }`}
        >
          <FolderOpen className="w-4 h-4 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{repo.name}</div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <GitBranch className="w-3 h-3" />
              <span className="truncate">{repo.currentBranch}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!repo.isClean && (
              <span className="w-2 h-2 rounded-full bg-yellow-400" title="有未提交的变更" />
            )}
            {repo.ahead > 0 && (
              <span className="text-xs text-green-400" title={`领先 ${repo.ahead} 个提交`}>
                ↑{repo.ahead}
              </span>
            )}
            {repo.behind > 0 && (
              <span className="text-xs text-red-400" title={`落后 ${repo.behind} 个提交`}>
                ↓{repo.behind}
              </span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemoveRepo(repo.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-900/50 rounded transition-all"
            title="移除仓库"
          >
            <Trash2 className="w-3 h-3 text-red-400" />
          </button>
        </div>
      ))}
    </div>
  );
}