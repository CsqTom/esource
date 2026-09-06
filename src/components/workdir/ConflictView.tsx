import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2, ChevronsUpDown } from 'lucide-react';
import type { ConflictSegment, ConflictSide } from '../../types';

interface ConflictViewProps {
  repoPath: string;
  filePath: string;
  /** 操作后刷新工作区状态 */
  onRefresh: () => void;
}

/** 展示未变更内容；过长的段落折叠，避免大文件渲染过多行 */
function NormalSegment({ lines }: { lines: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSE = 24;
  if (lines.length <= COLLAPSE) {
    return <pre className="px-4 text-xs font-mono text-gray-500 whitespace-pre-wrap leading-relaxed">{lines.join('\n')}</pre>;
  }
  if (expanded) {
    return <pre className="px-4 text-xs font-mono text-gray-500 whitespace-pre-wrap leading-relaxed">{lines.join('\n')}</pre>;
  }
  return (
    <div>
      <pre className="px-4 text-xs font-mono text-gray-500 whitespace-pre-wrap leading-relaxed">{lines.slice(0, 3).join('\n')}</pre>
      <button
        onClick={() => setExpanded(true)}
        className="mx-4 my-0.5 flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
      >
        <ChevronsUpDown className="w-3 h-3" />
        已省略 {lines.length - 6} 行未变更内容，点击展开
      </button>
      <pre className="px-4 text-xs font-mono text-gray-500 whitespace-pre-wrap leading-relaxed">{lines.slice(-3).join('\n')}</pre>
    </div>
  );
}

/** 单个冲突块：我方/对方两栏对照 + 逐块解决按钮 */
function ConflictBlock({
  seg, index, onResolve, pending,
}: {
  seg: Extract<ConflictSegment, { type: 'conflict' }>;
  index: number;
  onResolve: (index: number, side: ConflictSide) => void;
  pending: boolean;
}) {
  return (
    <div className="mx-4 my-2 border border-amber-800/60 rounded-lg overflow-hidden flex-shrink-0">
      {/* 操作行 */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/30 border-b border-amber-800/40">
        <span className="text-xs font-medium text-amber-300">冲突 {index + 1}</span>
        <div className="ml-auto flex items-center gap-1">
          {pending && <Loader2 className="w-3 h-3 animate-spin text-amber-300" />}
          <button
            onClick={() => onResolve(index, 'ours')}
            disabled={pending}
            className="px-2 py-0.5 text-xs bg-green-700/80 hover:bg-green-600 disabled:opacity-50 text-white rounded transition-colors"
          >
            用我的
          </button>
          <button
            onClick={() => onResolve(index, 'theirs')}
            disabled={pending}
            className="px-2 py-0.5 text-xs bg-blue-700/80 hover:bg-blue-600 disabled:opacity-50 text-white rounded transition-colors"
          >
            用对方的
          </button>
          <button
            onClick={() => onResolve(index, 'both')}
            disabled={pending}
            className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 rounded transition-colors"
          >
            两者都保留
          </button>
        </div>
      </div>
      {/* 我方 / 对方 两栏对照 */}
      <div className="grid grid-cols-2 divide-x divide-gray-700">
        <div className="bg-red-950/20 min-w-0">
          <div className="px-3 py-1 text-[11px] text-red-300 bg-red-900/20 border-b border-gray-700/50 truncate" title={seg.oursLabel}>
            我方（{seg.oursLabel || 'HEAD'}）
          </div>
          <pre className="px-3 py-1.5 text-xs font-mono text-red-100/90 whitespace-pre-wrap break-all leading-relaxed">
            {seg.ours.length ? seg.ours.join('\n') : '（我方此侧无内容）'}
          </pre>
        </div>
        <div className="bg-blue-950/20 min-w-0">
          <div className="px-3 py-1 text-[11px] text-blue-300 bg-blue-900/20 border-b border-gray-700/50 truncate" title={seg.theirsLabel}>
            对方（{seg.theirsLabel || '传入'}）
          </div>
          <pre className="px-3 py-1.5 text-xs font-mono text-blue-100/90 whitespace-pre-wrap break-all leading-relaxed">
            {seg.theirs.length ? seg.theirs.join('\n') : '（对方此侧无内容）'}
          </pre>
        </div>
      </div>
    </div>
  );
}

/** 冲突文件视图：解析工作区文件的冲突标记，逐块选择解决方式（替代普通 diff 展示） */
export function ConflictView({ repoPath, filePath, onRefresh }: ConflictViewProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['conflictDetail', repoPath, filePath],
    queryFn: () => window.electronAPI.workdir.conflictDetail(repoPath, filePath),
  });

  const refreshDetail = () => {
    queryClient.invalidateQueries({ queryKey: ['conflictDetail', repoPath, filePath] });
    onRefresh();
  };

  // 逐块解决：解决某一块后其余块的索引会前移，因此按当前文件内容单块替换
  const resolveBlockMutation = useMutation({
    mutationFn: ({ index, side }: { index: number; side: ConflictSide }) =>
      window.electronAPI.workdir.resolveConflictBlock(repoPath, filePath, index, side),
    onSuccess: refreshDetail,
    onError: (err: any) => setError(String(err?.message || err || '')),
  });

  // 批量解决所有块：每次都处理第 0 块（解决后其余块索引自动前移）
  const [bulkRunning, setBulkRunning] = useState(false);
  const handleResolveAll = async (side: 'ours' | 'theirs') => {
    if (!detail) return;
    setBulkRunning(true);
    setError(null);
    try {
      for (let i = 0; i < detail.segments.filter((s) => s.type === 'conflict').length; i++) {
        await window.electronAPI.workdir.resolveConflictBlock(repoPath, filePath, 0, side);
      }
      refreshDetail();
    } catch (err: any) {
      setError(String(err?.message || err || ''));
    } finally {
      setBulkRunning(false);
    }
  };

  // 全部块已处理：暂存以标记已解决（git add）
  const markResolvedMutation = useMutation({
    mutationFn: () => window.electronAPI.workdir.stage(repoPath, [filePath]),
    onSuccess: onRefresh,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />加载中...
      </div>
    );
  }
  if (!detail) {
    return <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">无法读取冲突内容</div>;
  }

  let blockIndex = -1;
  const conflictCount = detail.segments.filter((s) => s.type === 'conflict').length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 文件头 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/80 border-b border-gray-700 flex-shrink-0">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-sm font-medium text-gray-200 truncate" title={filePath}>{filePath}</span>
        {detail.hasMarkers ? (
          <>
            <span className="text-xs text-amber-300 whitespace-nowrap">{conflictCount} 个冲突</span>
            <div className="ml-auto flex items-center gap-1">
              {bulkRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />}
              <button
                onClick={() => handleResolveAll('ours')}
                disabled={bulkRunning}
                className="px-2 py-0.5 text-xs bg-green-700/80 hover:bg-green-600 disabled:opacity-50 text-white rounded transition-colors"
              >
                全部用我的
              </button>
              <button
                onClick={() => handleResolveAll('theirs')}
                disabled={bulkRunning}
                className="px-2 py-0.5 text-xs bg-blue-700/80 hover:bg-blue-600 disabled:opacity-50 text-white rounded transition-colors"
              >
                全部用对方的
              </button>
            </div>
          </>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-green-400">
              <Check className="w-3.5 h-3.5" />
              冲突已全部解决
            </span>
            <button
              onClick={() => markResolvedMutation.mutate()}
              disabled={markResolvedMutation.isPending}
              className="px-2.5 py-0.5 text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded transition-colors"
            >
              标记已解决并暂存
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-1.5 bg-red-900/30 border-b border-red-800/60 text-xs text-red-300 break-all flex-shrink-0">{error}</div>
      )}

      {/* 内容：普通段落 + 冲突卡片 */}
      <div className="flex-1 overflow-y-auto py-2">
        {detail.segments.map((seg, i) => {
          if (seg.type === 'normal') return <NormalSegment key={i} lines={seg.lines} />;
          blockIndex++;
          return (
            <ConflictBlock
              key={i}
              seg={seg}
              index={blockIndex}
              onResolve={(index, side) => { setError(null); resolveBlockMutation.mutate({ index, side }); }}
              pending={resolveBlockMutation.isPending && resolveBlockMutation.variables?.index === blockIndex}
            />
          );
        })}
      </div>
    </div>
  );
}
