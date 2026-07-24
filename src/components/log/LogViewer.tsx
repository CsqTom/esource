import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SerializedCommit, SerializedCommitDetail } from '../../types';
import {
  GitCommit,
  GitBranch,
  Calendar,
  User,
  ChevronRight,
  ChevronLeft,
  Search,
  MessageSquare,
  FileCode,
  Clock,
  ArrowLeft,
  Copy,
  ExternalLink,
  X,
  Hash,
  Tag,
} from 'lucide-react';

interface LogViewerProps {
  repoPath: string;
  onClose: () => void;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400)}天前`;
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

export function LogViewer({ repoPath, onClose }: LogViewerProps) {
  const queryClient = useQueryClient();
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [maxCount, setMaxCount] = useState(50);

  // 提交列表
  const { data: commits = [], isLoading } = useQuery({
    queryKey: ['log', repoPath, maxCount, searchQuery],
    queryFn: () => window.electronAPI.log.list(repoPath, {
      maxCount,
      search: searchQuery || undefined,
    }),
    staleTime: 5_000,
  });

  // 提交详情
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['log:detail', repoPath, selectedHash],
    queryFn: () => window.electronAPI.log.detail(repoPath, selectedHash!),
    enabled: !!selectedHash,
    staleTime: 30_000,
  });

  // 解析 refs 中的标签和分支
  const parseRefs = (refs: string[]) => {
    const branches: string[] = [];
    const tags: string[] = [];
    for (const ref of refs) {
      if (ref.startsWith('tag: ')) {
        tags.push(ref.replace('tag: ', ''));
      } else if (ref.includes(' -> ')) {
        // HEAD -> branch
        branches.push(ref.split(' -> ')[1] || ref);
      } else if (ref !== 'HEAD') {
        branches.push(ref);
      }
    }
    return { branches, tags };
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard?.writeText(hash);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 面板头 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <GitCommit className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium">提交历史</span>
        <span className="text-xs text-gray-500">({commits.length} 条提交)</span>
      </div>

      {/* 搜索栏 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-700 bg-gray-800/50">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索提交信息..."
            className="w-full bg-gray-700 text-gray-100 rounded pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
          />
        </div>
        <select
          value={maxCount}
          onChange={(e) => setMaxCount(Number(e.target.value))}
          className="bg-gray-700 text-gray-300 rounded px-2 py-1.5 text-sm border border-gray-600"
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={200}>200</option>
        </select>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 提交列表 */}
        <div className={`overflow-y-auto ${selectedHash ? 'w-1/2' : 'flex-1'} border-r border-gray-700`}>
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">加载中...</div>
          ) : commits.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">没有提交记录</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {commits.map((commit) => {
                const { branches, tags } = parseRefs(commit.refs);
                const isSelected = selectedHash === commit.hash;
                return (
                  <div
                    key={commit.hash}
                    onClick={() => setSelectedHash(commit.hash)}
                    className={`px-4 py-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-900/30 border-l-2 border-blue-500'
                        : 'hover:bg-gray-800 border-l-2 border-transparent'
                    }`}
                  >
                    {/* 提交信息 */}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-100 truncate">
                          {commit.message.split('\n')[0]}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <User className="w-3 h-3" />
                          <span className="truncate">{commit.author}</span>
                          <Clock className="w-3 h-3 ml-1" />
                          <span>{formatDate(commit.date)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopyHash(commit.hash); }}
                          className="p-1 hover:bg-gray-700 rounded opacity-0 group-hover:opacity-100"
                          title="复制 Hash"
                        >
                          <Copy className="w-3 h-3 text-gray-400" />
                        </button>
                        <code className="text-xs text-gray-400 font-mono">{shortHash(commit.hash)}</code>
                      </div>
                    </div>

                    {/* 分支/标签引用 */}
                    {(branches.length > 0 || tags.length > 0) && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {branches.map((b) => (
                          <span key={b} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded bg-green-900/40 text-green-300">
                            <GitBranch className="w-3 h-3" />
                            {b}
                          </span>
                        ))}
                        {tags.map((t) => (
                          <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded bg-yellow-900/40 text-yellow-300">
                            <Tag className="w-3 h-3" />
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 提交详情 */}
        {selectedHash && (
          <div className="flex-1 overflow-y-auto">
            {detailLoading ? (
              <div className="flex items-center justify-center h-32 text-gray-500 text-sm">加载详情...</div>
            ) : detail ? (
              <div className="p-4 space-y-4">
                {/* 提交信息 */}
                <div>
                  <h3 className="text-base font-semibold text-gray-100">{detail.message}</h3>
                  {detail.body && (
                    <pre className="mt-2 text-sm text-gray-400 whitespace-pre-wrap font-sans">{detail.body}</pre>
                  )}
                </div>

                {/* 元信息 */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Hash className="w-4 h-4 text-gray-500" />
                    <code className="text-xs font-mono text-gray-300">{detail.hash}</code>
                    <button onClick={() => handleCopyHash(detail.hash)} className="p-0.5 hover:bg-gray-700 rounded">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <User className="w-4 h-4 text-gray-500" />
                    <span>{detail.author} &lt;{detail.authorEmail}&gt;</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span>{formatFullDate(detail.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-400">
                    <FileCode className="w-4 h-4 text-gray-500" />
                    <span>{detail.changedFiles.length} 个文件变更</span>
                  </div>
                </div>

                {/* 变更文件列表 */}
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-1.5">
                    <FileCode className="w-4 h-4" />
                    变更文件
                  </h4>
                  <div className="space-y-0.5">
                    {detail.changedFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-gray-800">
                        <span className={`text-xs font-mono w-8 ${
                          f.status === 'A' ? 'text-green-400' :
                          f.status === 'D' ? 'text-red-400' :
                          f.status === 'M' ? 'text-blue-400' :
                          'text-gray-400'
                        }`}>
                          {f.status}
                        </span>
                        <span className="text-gray-300 truncate">{f.path}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-500 text-sm">无法加载提交详情</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}