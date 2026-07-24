import { useState } from 'react';
import { SerializedDiff } from '../../types';
import { ChevronDown, ChevronRight, Plus, Minus, FileCode } from 'lucide-react';

interface DiffViewerProps {
  diff: SerializedDiff;
  loading?: boolean;
}

export function DiffViewer({ diff, loading }: DiffViewerProps) {
  const [collapsedHunks, setCollapsedHunks] = useState<Set<number>>(new Set());

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!diff || diff.hunks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <FileCode className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>没有差异内容</p>
        </div>
      </div>
    );
  }

  const toggleHunk = (index: number) => {
    setCollapsedHunks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 文件头 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <FileCode className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-gray-200">{diff.file}</span>
        <span className="text-xs text-green-400 ml-2">+{diff.added}</span>
        <span className="text-xs text-red-400">-{diff.removed}</span>
      </div>

      {/* Diff 内容 */}
      <div className="flex-1 overflow-y-auto">
        <div className="font-mono text-xs leading-relaxed">
          {diff.hunks.map((hunk, hunkIndex) => (
            <div key={hunkIndex}>
              {/* Hunk 头 */}
              <div
                onClick={() => toggleHunk(hunkIndex)}
                className="flex items-center gap-2 px-4 py-1 bg-gray-800/80 border-b border-gray-700/50 cursor-pointer hover:bg-gray-700/50 sticky top-0"
              >
                <button className="p-0.5 hover:bg-gray-700 rounded">
                  {collapsedHunks.has(hunkIndex) ? (
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  )}
                </button>
                <span className="text-gray-400">{hunk.header}</span>
                <span className="ml-auto text-xs text-gray-500">
                  {hunk.lines.filter((l) => l.type === 'added').length} 新增{' '}
                  {hunk.lines.filter((l) => l.type === 'removed').length} 删除
                </span>
              </div>

              {!collapsedHunks.has(hunkIndex) && (
                <>
                  {/* 暂存/取消暂存块按钮 */}
                  <div className="flex gap-1 px-2 py-0.5 bg-gray-800/30">
                    <button
                      onClick={() => {
                        // 块暂存：通过 IPC 调用
                        window.electronAPI.workdir.stageHunk(
                          diff.file.includes('/') ? diff.file.split('/')[0] : '',
                          diff.file,
                          hunkIndex
                        );
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs text-green-400 hover:bg-green-900/30 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" /> 暂存块
                    </button>
                    <button
                      onClick={() => {
                        window.electronAPI.workdir.unstageHunk(
                          diff.file.includes('/') ? diff.file.split('/')[0] : '',
                          diff.file,
                          hunkIndex
                        );
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs text-orange-400 hover:bg-orange-900/30 rounded transition-colors"
                    >
                      <Minus className="w-3 h-3" /> 取消暂存块
                    </button>
                  </div>

                  {/* Diff 行 */}
                  {hunk.lines.map((line, lineIndex) => (
                    <div
                      key={lineIndex}
                      className={`flex px-4 ${
                        line.type === 'added'
                          ? 'diff-line-added'
                          : line.type === 'removed'
                          ? 'diff-line-removed'
                          : 'diff-line-context'
                      }`}
                    >
                      {/* 行号 */}
                      <span className="diff-line-number w-[50px] text-right">
                        {line.oldLineNo ?? ''}
                      </span>
                      <span className="diff-line-number w-[50px] text-right">
                        {line.newLineNo ?? ''}
                      </span>
                      {/* 内容 */}
                      <span className="flex-1 whitespace-pre px-1">
                        {line.content}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}