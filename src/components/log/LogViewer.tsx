import { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SerializedCommit } from '../../types';
import { ArrowLeft, Search, FileCode, User, Calendar, Clock, Copy, Hash, Tag, GitBranch, Loader2 } from 'lucide-react';

interface LogViewerProps { repoPath: string; onClose: () => void; }

function formatDate(t: number): string {
  const d = new Date(t), n = new Date(), diff = n.getTime() - d.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

const COLORS = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#FF5722', '#3F51B5', '#CDDC39', '#E91E63'];
const COL_W = 14, PAD = 6, ROW_H = 28, MID_Y = ROW_H / 2, DOT_R = 4;

// ===== 提交的子提交信息 =====
interface CommitChildren {
  /** branchChildren：此提交是 child 的第一父提交（延续分支） */
  branch: string[];
  /** mergeChildren：此提交是 child 的非第一父提交（合并入分支） */
  merge: string[];
}

// ===== 图连线 =====
interface GraphEdge {
  fromCol: number;
  toCol: number;
  /** 连线类型：branch=延续分支, merge=合并 */
  type: 'branch' | 'merge';
  color: string;
}

// ===== 合并线隔行延续 =====
interface MergePassThrough {
  /** 需要延续竖线的列号（合并线终点的列） */
  col: number;
  color: string;
}

interface GraphNode {
  /** 此提交所在的列号 */
  col: number;
  /** 活跃分支列表（null 表示该列空闲） */
  branches: (string | null)[];
  /** 子连线：从子提交到此提交的跨列连线（顶部 → MID_Y） */
  childEdges: GraphEdge[];
  /** 父连线：从此提交到父提交的跨列连线（MID_Y → 底部） */
  parentEdges: GraphEdge[];
  /** 合并线隔行延续：合并线跨越多行时的中间竖线 */
  mergePassThroughs: MergePassThrough[];
}

/**
 * 预计算每个提交的 children 关系
 * 区分 branch（第一父提交，延续分支）和 merge（其他父提交，合并入分支）
 */
function computeChildren(commits: SerializedCommit[]): Map<string, CommitChildren> {
  const result = new Map<string, CommitChildren>();
  for (const c of commits) result.set(c.hash, { branch: [], merge: [] });
  for (const c of commits) {
    for (let i = 0; i < c.parents.length; i++) {
      const parent = result.get(c.parents[i]);
      if (!parent) continue;
      if (i === 0) parent.branch.push(c.hash);
      else parent.merge.push(c.hash);
    }
  }
  return result;
}

/**
 * 构建 DAG 图结构
 *
 * 参考 pvigier 的 curved_branches 算法 + sourcetree-rust 实现。
 * 从最新→最旧遍历提交（依赖后端 --date-order 已保证拓扑序），
 * 保证子提交先分配列号，父提交替换子提交位置，实现同一分支连续。
 *
 * 三遍扫描：
 * 1. 分配列号（仅 branchChildren 可替换，mergeChildren 不替换避免重复列）
 * 2. 计算子连线（childEdges，区分 branch/merge 类型）
 * 3. 计算父连线（parentEdges）+ 合并线隔行延续（mergePassThroughs）
 */
function buildGraph(commits: SerializedCommit[]): GraphNode[] {
  if (commits.length === 0) return [];

  const childrenMap = computeChildren(commits);
  const colMap = new Map<string, number>();
  // 活跃分支列表 B：B[j] = commitId | null
  const B: (string | null)[] = [];
  const rowsMap = new Map<string, GraphNode>();

  // ===== 第一遍：分配列号（最新→最旧） =====
  for (const commit of commits) {
    const ch = childrenMap.get(commit.hash)!;

    // 选择一个 branchChild 来替换（优先选最左边的列），mergeChild 不参与替换
    let replaceChild: string | null = null, replaceIdx = -1;
    for (const childId of ch.branch) {
      const childCol = colMap.get(childId);
      if (childCol !== undefined && (replaceIdx === -1 || childCol < replaceIdx)) {
        replaceChild = childId; replaceIdx = childCol;
      }
    }

    if (replaceChild !== null) {
      // 延续分支：替换子提交在该列的位置
      B[replaceIdx] = commit.hash;
      colMap.set(commit.hash, replaceIdx);
    } else {
      // 新分支：找空位或追加
      const nilIdx = B.indexOf(null);
      if (nilIdx !== -1) { B[nilIdx] = commit.hash; colMap.set(commit.hash, nilIdx); }
      else { B.push(commit.hash); colMap.set(commit.hash, B.length - 1); }
    }

    // 移除未选中的 branchChildren（其分支在此结束）
    for (const childId of ch.branch) {
      if (childId === replaceChild) continue;
      const childCol = colMap.get(childId);
      if (childCol !== undefined && B[childCol] === childId) B[childCol] = null;
    }

    rowsMap.set(commit.hash, {
      col: colMap.get(commit.hash)!,
      branches: [...B],
      childEdges: [],
      parentEdges: [],
      mergePassThroughs: [],
    });
  }

  // ===== 第二遍：计算子连线（childEdges，区分 branch/merge） =====
  for (const commit of commits) {
    const commitCol = colMap.get(commit.hash)!;
    const ch = childrenMap.get(commit.hash)!;
    const childEdges: GraphEdge[] = [];

    for (const childId of ch.branch) {
      const childCol = colMap.get(childId);
      if (childCol !== undefined && childCol !== commitCol) {
        childEdges.push({ fromCol: childCol, toCol: commitCol, type: 'branch', color: COLORS[childCol % COLORS.length] });
      }
    }
    for (const childId of ch.merge) {
      const childCol = colMap.get(childId);
      if (childCol !== undefined && childCol !== commitCol) {
        childEdges.push({ fromCol: childCol, toCol: commitCol, type: 'merge', color: COLORS[childCol % COLORS.length] });
      }
    }
    rowsMap.get(commit.hash)!.childEdges = childEdges;
  }

  // ===== 第三遍：计算父连线（parentEdges）+ 合并线隔行延续 =====
  const commitIndexMap = new Map<string, number>();
  commits.forEach((c, i) => commitIndexMap.set(c.hash, i));

  for (const commit of commits) {
    const commitCol = colMap.get(commit.hash)!;
    const parentEdges: GraphEdge[] = [];

    for (let i = 0; i < commit.parents.length; i++) {
      const parentCol = colMap.get(commit.parents[i]);
      if (parentCol === undefined || parentCol === commitCol) continue;
      const edgeType = i === 0 ? 'branch' : 'merge';
      parentEdges.push({ fromCol: commitCol, toCol: parentCol, type: edgeType, color: COLORS[parentCol % COLORS.length] });

      // 合并线需在隔行补竖线延续（父提交不在相邻下一行时）
      if (edgeType === 'merge') {
        const pIdx = commitIndexMap.get(commit.parents[i]);
        const cIdx = commitIndexMap.get(commit.hash);
        if (pIdx !== undefined && cIdx !== undefined && pIdx > cIdx + 1) {
          for (let r = cIdx + 1; r < pIdx; r++) {
            const row = rowsMap.get(commits[r].hash);
            if (row && !row.mergePassThroughs.some(m => m.col === parentCol)) {
              row.mergePassThroughs.push({ col: parentCol, color: COLORS[parentCol % COLORS.length] });
            }
          }
        }
      }
    }
    rowsMap.get(commit.hash)!.parentEdges = parentEdges;
  }

  return commits.map(c => rowsMap.get(c.hash) || { col: 0, branches: [c.hash], childEdges: [], parentEdges: [], mergePassThroughs: [] });
}

const colX = (col: number) => PAD + col * COL_W + COL_W / 2;

function CommitRow({ commit, node, isSelected, maxCols, onClick }: { commit: SerializedCommit; node: GraphNode; isSelected: boolean; maxCols: number; onClick: () => void }) {
  const svgW = maxCols * COL_W + PAD * 2;
  const cx = colX(node.col);
  const dotColor = COLORS[node.col % COLORS.length];
  const branches = [...new Set(commit.refs.filter(r => !r.startsWith('tag: ') && r !== 'HEAD').map(r => r.includes(' -> ') ? (r.split(' -> ')[1] || '').trim() : r.trim()).filter(Boolean))];
  const tags = [...new Set(commit.refs.filter(r => r.startsWith('tag: ')).map(r => r.replace('tag: ', '').trim()).filter(Boolean))];
  return (
    <div onClick={onClick} className={`flex items-center cursor-pointer transition-colors hover:bg-gray-800 ${isSelected ? 'bg-blue-900/30' : ''}`} style={{ height: ROW_H }}>
      <svg width={svgW} height={ROW_H} viewBox={`0 0 ${svgW} ${ROW_H}`} className="shrink-0">
        {/* 1. 竖线：活跃分支列（贯穿整行 y=0 → ROW_H） */}
        {node.branches.map((bid, j) => {
          if (bid === null) return null; const x = colX(j);
          return <line key={`v-${j}`} x1={x} y1={0} x2={x} y2={ROW_H} stroke={COLORS[j % COLORS.length]} strokeWidth={2.5} opacity={bid === commit.hash ? 1 : 0.6} />;
        })}
        {/* 1b. 合并线隔行延续竖线（避免与活跃分支竖线重复） */}
        {node.mergePassThroughs.map(mt => {
          if (mt.col < node.branches.length && node.branches[mt.col] !== null) return null;
          const x = colX(mt.col);
          return <line key={`mt-${mt.col}`} x1={x} y1={0} x2={x} y2={ROW_H} stroke={mt.color} strokeWidth={2.5} opacity={0.6} />;
        })}
        {/* 2. 子连线（仅 branch 类型在父行绘制；merge 类型在子行绘制，避免重复） */}
        {node.childEdges.filter(e => e.type === 'branch').map((e, i) => {
          if (e.fromCol === e.toCol) return null; const fx = colX(e.fromCol), tx = colX(e.toCol);
          return <path key={`ce-${i}`} d={`M ${fx} 0 L ${fx} ${MID_Y * 0.35} C ${fx} ${MID_Y * 0.35 + 6}, ${tx} ${MID_Y - 6}, ${tx} ${MID_Y}`} stroke={e.color} strokeWidth={2} fill="none" />;
        })}
        {/* 3. 父连线（仅 merge 类型在子行绘制；branch 类型由竖线覆盖） */}
        {node.parentEdges.filter(e => e.type === 'merge').map((e, i) => {
          if (e.fromCol === e.toCol) return null; const fx = colX(e.fromCol), tx = colX(e.toCol);
          return <path key={`pe-${i}`} d={`M ${fx} ${MID_Y} C ${fx} ${MID_Y + 6}, ${tx} ${ROW_H - 6}, ${tx} ${ROW_H}`} stroke={e.color} strokeWidth={2} fill="none" />;
        })}
        <circle key="dot" cx={cx} cy={MID_Y} r={DOT_R} fill={isSelected ? '#60A5FA' : dotColor} stroke="#1F2937" strokeWidth={2} />
      </svg>
      <div className="flex-1 flex items-center min-w-0 gap-1 px-2" style={{ height: ROW_H }}>
        {branches.map((b, i) => <span key={`b-${i}`} className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] rounded bg-green-900/40 text-green-300 font-mono whitespace-nowrap"><GitBranch className="w-3 h-3" />{b}</span>)}
        {tags.map((t, i) => <span key={`t-${i}`} className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] rounded bg-yellow-900/40 text-yellow-300 font-mono whitespace-nowrap"><Tag className="w-3 h-3" />{t}</span>)}
        <span className="text-sm text-gray-100 truncate flex-1 min-w-0">{commit.message.split('\n')[0]}</span>
        <span className="text-xs text-gray-500 hidden sm:block truncate max-w-[100px]">{commit.author}</span>
        <span className="text-xs text-gray-500 hidden md:block whitespace-nowrap">{formatDate(commit.date)}</span>
        <code className="text-xs text-gray-500 font-mono hidden lg:block">{commit.hash.slice(0, 7)}</code>
      </div>
    </div>
  );
}

export function LogViewer({ repoPath, onClose }: LogViewerProps) {
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [maxCount, setMaxCount] = useState(100);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: commits = [], isLoading } = useQuery({
    queryKey: ['log', repoPath, maxCount, searchQuery],
    queryFn: () => window.electronAPI.log.list(repoPath, { maxCount, search: searchQuery || undefined }),
    staleTime: 5_000,
  });

  // 后端已按 --date-order 返回（拓扑序 + 时间序），不再重排以免打乱父子关系导致连线断裂
  const graph = useMemo(() => buildGraph(commits), [commits]);
  const maxCols = useMemo(() => Math.max(1, ...graph.map(r => Math.max(r.col + 1, r.branches.length))), [graph]);

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['log:detail', repoPath, selectedHash],
    queryFn: () => window.electronAPI.log.detail(repoPath, selectedHash!),
    enabled: !!selectedHash, staleTime: 30_000,
  });

  const handleCopy = (hash: string) => navigator.clipboard?.writeText(hash);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded"><ArrowLeft className="w-4 h-4" /></button>
        <span className="text-sm font-medium">提交历史</span>
        <span className="text-xs text-gray-500">({commits.length} 条)</span>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-700 bg-gray-800/50">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜索提交信息..." className="w-full bg-gray-700 text-gray-100 rounded pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500" />
        </div>
        <select value={maxCount} onChange={e => setMaxCount(Number(e.target.value))} className="bg-gray-700 text-gray-300 rounded px-2 py-1.5 text-sm border border-gray-600">
          <option value={50}>50</option><option value={100}>100</option><option value={200}>200</option><option value={500}>500</option>
        </select>
      </div>

      <div className="flex border-b border-gray-700 bg-gray-800/80 text-[10px] text-gray-500 font-medium uppercase tracking-wider">
        <div style={{ width: maxCols * COL_W + PAD * 2 }} className="shrink-0" />
        <div className="flex-1 flex items-center gap-1 px-2 py-1">
          <span className="flex-1 min-w-0">提交说明</span>
          <span className="hidden sm:block w-[100px] text-right">作者</span>
          <span className="hidden md:block w-[80px] text-right">日期</span>
          <span className="hidden lg:block w-[60px] text-right">版本</span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div ref={scrollRef} className="overflow-y-auto flex-1 border-r border-gray-700">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" />加载中...</div>
          ) : commits.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">没有提交记录</div>
          ) : (
            commits.map((commit, idx) => (
              <CommitRow key={commit.hash} commit={commit} node={graph[idx] || { col: 0, branches: [], childEdges: [], parentEdges: [], mergePassThroughs: [] }} isSelected={selectedHash === commit.hash} maxCols={maxCols} onClick={() => setSelectedHash(commit.hash)} />
            ))
          )}
        </div>

        {selectedHash && (
          <div className="w-96 overflow-y-auto border-l border-gray-700">
            {detailLoading ? (
              <div className="flex items-center justify-center h-32 text-gray-500 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" />加载中...</div>
            ) : detail ? (
              <div className="p-4 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-100">{detail.message.split('\n')[0]}</h3>
                  {detail.body && <pre className="mt-2 text-sm text-gray-400 whitespace-pre-wrap font-sans">{detail.body}</pre>}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-400"><Hash className="w-4 h-4 text-gray-500 shrink-0" /><code className="text-xs font-mono text-gray-300 break-all">{detail.hash}</code><button onClick={() => handleCopy(detail.hash)} className="p-0.5 hover:bg-gray-700 rounded shrink-0"><Copy className="w-3 h-3" /></button></div>
                  <div className="flex items-center gap-2 text-gray-400"><User className="w-4 h-4 text-gray-500 shrink-0" /><span className="truncate">{detail.author} &lt;{detail.authorEmail}&gt;</span></div>
                  <div className="flex items-center gap-2 text-gray-400"><Calendar className="w-4 h-4 text-gray-500 shrink-0" /><span>{new Date(detail.date).toLocaleString()}</span></div>
                  <div className="flex items-center gap-2 text-gray-400"><FileCode className="w-4 h-4 text-gray-500 shrink-0" /><span>{detail.changedFiles.length} 个文件变更</span></div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-1.5"><FileCode className="w-4 h-4" />变更文件</h4>
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {detail.changedFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-gray-800">
                        <span className={`text-xs font-mono w-8 ${f.status === 'A' ? 'text-green-400' : f.status === 'D' ? 'text-red-400' : f.status === 'M' ? 'text-blue-400' : 'text-gray-400'}`}>{f.status}</span>
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