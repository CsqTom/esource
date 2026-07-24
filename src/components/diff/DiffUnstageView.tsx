import { useState, useCallback, useRef } from 'react';
import { SerializedDiff, SelectionRange } from '../../types';
import { ChevronDown, ChevronRight, Plus, RotateCcw, FileCode, MousePointer2, AlertCircle } from 'lucide-react';
import { FileViewer } from '../viewer/FileViewer';

interface DiffUnstageViewProps {
  diff: SerializedDiff;
  isUntracked?: boolean;
  untrackedContent?: string;
  untrackedContentBase64?: string;
  loading?: boolean;
  repoPath?: string;
  onActionComplete?: () => void;
}

export function DiffUnstageView({ diff, isUntracked, untrackedContent, untrackedContentBase64, loading, repoPath, onActionComplete }: DiffUnstageViewProps) {
  const [collapsedHunks, setCollapsedHunks] = useState<Set<number>>(new Set());
  const [selectedLines, setSelectedLines] = useState<Map<string, Set<number>>>(new Map());
  const [lastClickedLine, setLastClickedLine] = useState<{ hunkIdx: number; lineIdx: number } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isLineSelected = useCallback((hunkIdx: number, lineIdx: number): boolean => {
    try { return selectedLines.get(`h${hunkIdx}`)?.has(lineIdx) ?? false; } catch { return false; }
  }, [selectedLines]);

  const handleLineClick = useCallback((hunkIdx: number, lineIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      setSelectedLines((prev) => {
        const next = new Map(prev); const key = `h${hunkIdx}`; const set = new Set(next.get(key) || []);
        if (set.has(lineIdx)) { set.delete(lineIdx); if (set.size === 0) next.delete(key); else next.set(key, set); }
        else { set.add(lineIdx); next.set(key, set); }
        return next;
      });
      setLastClickedLine({ hunkIdx, lineIdx });
    } else if (e.shiftKey && lastClickedLine && lastClickedLine.hunkIdx === hunkIdx) {
      const start = Math.min(lastClickedLine.lineIdx, lineIdx);
      const end = Math.max(lastClickedLine.lineIdx, lineIdx);
      setSelectedLines((prev) => {
        const next = new Map(prev); const key = `h${hunkIdx}`; const set = new Set<number>();
        for (let i = start; i <= end; i++) set.add(i);
        const prevSet = next.get(key); if (prevSet) { for (const v of prevSet) set.add(v); }
        next.set(key, set); return next;
      });
    } else {
      setSelectedLines(new Map([[`h${hunkIdx}`, new Set([lineIdx])]]));
      setLastClickedLine({ hunkIdx, lineIdx });
    }
  }, [lastClickedLine]);

  const clearSelection = useCallback(() => { setSelectedLines(new Map()); setLastClickedLine(null); }, []);

  const getSelections = useCallback((): SelectionRange[] => {
    try {
      const selections: SelectionRange[] = [];
      for (const [key, lines] of selectedLines) {
        const match = key.match(/^h(\d+)$/); if (!match) continue;
        const hunkIdx = parseInt(match[1], 10); if (lines.size === 0) continue;
        const sorted = Array.from(lines).sort((a, b) => a - b);
        let start = sorted[0], end = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] === end + 1) { end = sorted[i]; }
          else { selections.push({ hunkIndex: hunkIdx, startLine: start, endLine: end }); start = sorted[i]; end = sorted[i]; }
        }
        selections.push({ hunkIndex: hunkIdx, startLine: start, endLine: end });
      }
      return selections;
    } catch { return []; }
  }, [selectedLines]);

  const safeCall = useCallback(async (label: string, fn: () => Promise<void>) => {
    try { setErrorMsg(null); setActionLoading(true); await fn(); clearSelection(); onActionComplete?.(); }
    catch (err: any) { const msg = err?.message || String(err); setErrorMsg(msg); console.error(`[${label}] 失败:`, msg); }
    finally { try { setActionLoading(false); } catch {} }
  }, [clearSelection, onActionComplete]);

  const handleStage = useCallback(() => {
    if (!repoPath || !diff) return;
    safeCall('stage', async () => {
      const selections = getSelections(); const file = diff.file;
      if (selections.length > 0) { await window.electronAPI.workdir.stageLines(repoPath, file, selections); }
      else { await window.electronAPI.workdir.stage(repoPath, [file]); }
    });
  }, [repoPath, diff, getSelections, safeCall]);

  const handleDiscard = useCallback(() => {
    if (!repoPath || !diff) return;
    safeCall('discard', async () => {
      const selections = getSelections(); const file = diff.file;
      if (selections.length > 0) { await window.electronAPI.workdir.discardLines(repoPath, file, selections); }
      else { await window.electronAPI.workdir.discard(repoPath, [file]); }
    });
  }, [repoPath, diff, getSelections, safeCall]);

  const handleStageHunk = useCallback((hunkIdx: number) => {
    if (!repoPath || !diff) return;
    safeCall('stageHunk', async () => { await window.electronAPI.workdir.stageHunk(repoPath, diff.file, hunkIdx); });
  }, [repoPath, diff, safeCall]);

  const handleDiscardHunk = useCallback((hunkIdx: number) => {
    if (!repoPath || !diff) return;
    safeCall('discardHunk', async () => {
      await window.electronAPI.workdir.discardLines(repoPath, diff.file, [{ hunkIndex: hunkIdx, startLine: 0, endLine: diff.hunks[hunkIdx].lines.length - 1 }]);
    });
  }, [repoPath, diff, safeCall]);

  const toggleHunk = useCallback((index: number) => {
    setCollapsedHunks((prev) => { const next = new Set(prev); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  }, []);

  if (loading) return (<div className="flex-1 flex items-center justify-center"><div className="text-gray-500">加载中...</div></div>);

  // ── 未跟踪文件：使用 FileViewer 显示内容 ──
  if (isUntracked) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <FileCode className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium text-gray-200">{diff.file}</span>
          <span className="text-xs bg-green-900/40 text-green-300 px-1.5 py-0.5 rounded ml-2">未跟踪</span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={handleStage} disabled={actionLoading}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded transition-colors">
              <Plus className="w-3.5 h-3.5" />暂存文件
            </button>
            <span className="text-xs text-gray-500">（新文件仅支持整文件暂存）</span>
          </div>
        </div>
        {errorMsg && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-red-900/40 border-b border-red-700/50 text-xs text-red-300">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /><span className="flex-1 truncate">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-200">✕</button>
          </div>
        )}
        <FileViewer filePath={diff.file} repoPath={repoPath || ''} content={untrackedContent} contentBase64={untrackedContentBase64} />
      </div>
    );
  }

  if (!diff || !diff.hunks || diff.hunks.length === 0) return (
    <div className="flex-1 flex items-center justify-center text-gray-500">
      <div className="text-center"><FileCode className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>没有差异内容</p></div>
    </div>
  );

  const hasSelection = selectedLines.size > 0;
  const totalSelected = Array.from(selectedLines.values()).reduce((sum, s) => sum + s.size, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <FileCode className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-gray-200">{diff.file}</span>
        <span className="text-xs text-green-400 ml-2">+{diff.added}</span>
        <span className="text-xs text-red-400">-{diff.removed}</span>
        <div className="ml-auto flex items-center gap-1">
          {hasSelection && <span className="text-xs text-gray-500 mr-1">已选 {totalSelected} 行</span>}
          <button onClick={handleStage} disabled={actionLoading}
            className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded transition-colors">
            <Plus className="w-3.5 h-3.5" />{hasSelection ? '暂存选中行' : '暂存全部'}
          </button>
          <button onClick={handleDiscard} disabled={actionLoading}
            className="flex items-center gap-1 px-3 py-1 text-xs bg-red-600/70 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 rounded transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />{hasSelection ? '丢弃选中行' : '丢弃全部'}
          </button>
          {hasSelection && <button onClick={clearSelection} className="px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 rounded transition-colors">清除选择</button>}
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-red-900/40 border-b border-red-700/50 text-xs text-red-300">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /><span className="flex-1 truncate">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <div className="font-mono text-xs leading-relaxed">
          {diff.hunks.map((hunk, hunkIdx) => (
            <div key={hunkIdx}>
              <div onClick={() => toggleHunk(hunkIdx)}
                className="flex items-center gap-2 px-4 py-1 bg-gray-800/80 border-b border-gray-700/50 cursor-pointer hover:bg-gray-700/50 sticky top-0 z-10">
                <button className="p-0.5 hover:bg-gray-700 rounded">
                  {collapsedHunks.has(hunkIdx) ? <ChevronRight className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                </button>
                <span className="text-gray-400">{hunk.header}</span>
                <span className="ml-auto flex items-center gap-1 text-xs text-gray-500">
                  <span className="text-green-400">{hunk.lines.filter((l) => l.type === 'added').length} 新增</span>
                  <span className="text-red-400">{hunk.lines.filter((l) => l.type === 'removed').length} 删除</span>
                </span>
                <div className="flex items-center gap-0.5 ml-2 opacity-0 hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); handleStageHunk(hunkIdx); }}
                    className="p-1 hover:bg-green-900/30 rounded text-green-400" title="暂存此块"><Plus className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDiscardHunk(hunkIdx); }}
                    className="p-1 hover:bg-red-900/30 rounded text-red-400" title="丢弃此块"><RotateCcw className="w-3 h-3" /></button>
                </div>
              </div>
              {!collapsedHunks.has(hunkIdx) && (
                <div className="relative">
                  <div className="flex items-center gap-2 px-4 py-0.5 bg-gray-800/20 border-b border-gray-700/30">
                    <MousePointer2 className="w-3 h-3 text-gray-500" />
                    <span className="text-xs text-gray-500">CTRL+单击多选，SHIFT+单击连选</span>
                  </div>
                  {hunk.lines.map((line, lineIdx) => {
                    const selected = isLineSelected(hunkIdx, lineIdx);
                    return (
                      <div key={lineIdx} onClick={(e) => handleLineClick(hunkIdx, lineIdx, e)}
                        className={`flex px-4 cursor-pointer select-none transition-colors ${
                          line.type === 'added' ? (selected ? 'diff-line-added ring-1 ring-inset ring-green-500/50' : 'diff-line-added')
                          : line.type === 'removed' ? (selected ? 'diff-line-removed ring-1 ring-inset ring-red-500/50' : 'diff-line-removed')
                          : selected ? 'bg-blue-900/40 ring-1 ring-inset ring-blue-500/50' : 'diff-line-context'
                        }`}>
                        <div className="flex items-center mr-1">
                          <div className={`w-3 h-3 rounded border transition-colors flex items-center justify-center ${selected ? 'bg-blue-500 border-blue-500' : 'border-gray-600 opacity-0 group-hover:opacity-100'}`}>
                            {selected && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </div>
                        </div>
                        <span className="diff-line-number w-[45px] text-right">{line.oldLineNo ?? ''}</span>
                        <span className="diff-line-number w-[45px] text-right">{line.newLineNo ?? ''}</span>
                        <span className="flex-1 whitespace-pre px-1">{line.content}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}