import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AlertTriangle, Undo2, FileText, ChevronDown, ChevronRight, Loader2, Check } from 'lucide-react';

interface ConflictPanelProps {
  repoPath: string;
  /** 冲突文件列表（来自 status.conflicted） */
  files: string[];
  /** 当前在 diff 区打开的文件 */
  selectedFile?: string | null;
  /** 点击文件名：在 diff 区打开冲突视图 */
  onOpenFile: (file: string) => void;
  /** 操作后刷新工作区状态 */
  onRefresh: () => void;
}

const OP_LABEL: Record<string, string> = {
  merge: '合并冲突',
  rebase: '变基冲突',
  'cherry-pick': 'Cherry-pick 冲突',
};
const ABORT_LABEL: Record<string, string> = {
  merge: '中止合并',
  rebase: '中止变基',
  'cherry-pick': '中止 Cherry-pick',
};

/** 冲突解决面板：列出未解决的冲突文件，提供快速解决动作 */
export function ConflictPanel({ repoPath, files, selectedFile, onOpenFile, onRefresh }: ConflictPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const { data: state } = useQuery({
    queryKey: ['conflictState', repoPath],
    queryFn: () => window.electronAPI.workdir.conflictState(repoPath),
    staleTime: 10_000,
  });

  // 整文件快速解决（用我的/用对方的）：checkout --ours/--theirs 并暂存
  const resolveMutation = useMutation({
    mutationFn: ({ file, resolution }: { file: string; resolution: 'ours' | 'theirs' }) =>
      window.electronAPI.workdir.resolveConflict(repoPath, file, resolution),
    onSuccess: onRefresh,
  });
  // 标记已解决：手动编辑完冲突后直接暂存
  const markResolvedMutation = useMutation({
    mutationFn: (file: string) => window.electronAPI.workdir.stage(repoPath, [file]),
    onSuccess: onRefresh,
  });
  const abortMutation = useMutation({
    mutationFn: () => window.electronAPI.workdir.abortConflictOperation(repoPath),
    onSuccess: onRefresh,
  });

  const opText = state?.operation ? OP_LABEL[state.operation] : '存在未解决的冲突文件';
  const busy = resolveMutation.isPending || markResolvedMutation.isPending || abortMutation.isPending;

  const handleAbort = () => {
    const label = state?.operation ? ABORT_LABEL[state.operation] : '中止';
    if (!confirm(`${label}将丢弃当前的合并过程，恢复到操作前的状态。确定继续吗？`)) return;
    abortMutation.mutate();
  };

  return (
    <div className="border-b border-amber-900/50 bg-amber-950/30 flex-shrink-0 max-h-[45%] flex flex-col">
      {/* 标题行 */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0">
        <button onClick={() => setExpanded(!expanded)} className="p-0.5 text-amber-300 hover:text-amber-200 rounded">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-sm font-medium text-amber-200 whitespace-nowrap">{opText}</span>
        {state?.source && (
          <span className="text-xs text-amber-300/70 truncate" title={state.source}>{state.source}</span>
        )}
        <span className="text-xs text-amber-200/60 whitespace-nowrap">({files.length} 个文件)</span>
        <div className="ml-auto flex items-center gap-1">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />}
          {state?.operation && (
            <button
              onClick={handleAbort}
              className="flex items-center gap-1 px-2 py-0.5 text-xs text-amber-200 border border-amber-800/60 hover:bg-amber-900/40 rounded transition-colors"
            >
              <Undo2 className="w-3 h-3" />
              {state.operation ? ABORT_LABEL[state.operation] : '中止'}
            </button>
          )}
        </div>
      </div>

      {/* 文件列表 */}
      {expanded && (
        <div className="px-3 pb-2 space-y-0.5 overflow-y-auto min-h-0">
          {files.map((file) => (
            <div
              key={file}
              className={`group flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors ${
                selectedFile === file ? 'bg-amber-900/40' : 'hover:bg-amber-900/20'
              }`}
            >
              <button
                onClick={() => onOpenFile(file)}
                className="flex-1 min-w-0 flex items-center gap-1.5 text-left text-amber-100 hover:underline"
                title={`在 diff 区逐块解决：${file}`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0 text-amber-300/80" />
                <span className="truncate">{file}</span>
              </button>
              <button
                onClick={() => resolveMutation.mutate({ file, resolution: 'ours' })}
                disabled={busy}
                className="px-1.5 py-0.5 bg-green-800/70 hover:bg-green-700 disabled:opacity-50 text-green-100 rounded whitespace-nowrap transition-colors"
                title="保留当前分支（HEAD）的版本并暂存"
              >
                用我的
              </button>
              <button
                onClick={() => resolveMutation.mutate({ file, resolution: 'theirs' })}
                disabled={busy}
                className="px-1.5 py-0.5 bg-blue-800/70 hover:bg-blue-700 disabled:opacity-50 text-blue-100 rounded whitespace-nowrap transition-colors"
                title="采用传入分支的版本并暂存"
              >
                用对方的
              </button>
              <button
                onClick={() => markResolvedMutation.mutate(file)}
                disabled={busy}
                className="flex items-center gap-0.5 px-1.5 py-0.5 text-gray-300 hover:bg-gray-700 disabled:opacity-50 rounded whitespace-nowrap transition-colors"
                title="已手动编辑解决，暂存该文件以标记已解决"
              >
                <Check className="w-3 h-3" />
                标记已解决
              </button>
            </div>
          ))}
          <div className="text-[11px] text-amber-200/50 px-2 pt-1">
            点击文件名可查看冲突内容并逐块选择解决方式；全部解决后输入提交说明并提交即可完成。
          </div>
        </div>
      )}
    </div>
  );
}
