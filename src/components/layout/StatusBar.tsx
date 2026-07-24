import { GitBranch } from 'lucide-react';

interface StatusBarProps {
  repoPath: string;
  currentBranch: string;
  ahead: number;
  behind: number;
  isClean: boolean;
}

export function StatusBar({ repoPath, currentBranch, ahead, behind, isClean }: StatusBarProps) {
  return (
    <footer className="h-6 bg-gray-800 border-t border-gray-700 flex items-center px-3 text-xs text-gray-500 flex-shrink-0">
      <div className="flex items-center gap-2">
        <GitBranch className="w-3 h-3" />
        <span>{currentBranch}</span>
      </div>

      {ahead > 0 && (
        <span className="ml-3 text-green-400">↑{ahead}</span>
      )}
      {behind > 0 && (
        <span className="ml-3 text-red-400">↓{behind}</span>
      )}

      {!isClean && (
        <span className="ml-3 text-yellow-400">● 有未提交的变更</span>
      )}

      {isClean && (
        <span className="ml-3 text-green-400">✔ 工作区干净</span>
      )}

      <span className="ml-auto truncate max-w-[400px]" title={repoPath}>
        {repoPath}
      </span>
    </footer>
  );
}