// ── Electron 主进程全局类型 ──
// 这些类型与 src/types/index.ts 保持一致，但专门用于主进程（Node.js 环境）

interface SerializedRepository {
  id: string;
  name: string;
  path: string;
  currentBranch: string;
  isClean: boolean;
  ahead: number;
  behind: number;
  remoteUrl: string;
  addedAt: number;
}

interface SerializedBranch {
  name: string;
  current: boolean;
  commit: string;
  label: string;
  remote: boolean;
}

interface SerializedStatus {
  current: string;
  tracking: string;
  files: SerializedStatusFile[];
  ahead: number;
  behind: number;
  isClean: boolean;
  conflicted: string[];
  created: string[];
  deleted: string[];
  modified: string[];
  renamed: { from: string; to: string }[];
  staged: string[];
  not_added: string[];
}

interface SerializedStatusFile {
  path: string;
  index: string;
  working_dir: string;
}

interface SerializedDiff {
  file: string;
  hunks: SerializedHunk[];
  added: number;
  removed: number;
}

interface SerializedHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: SerializedDiffLine[];
}

interface SerializedDiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

interface SerializedCommit {
  hash: string;
  author: string;
  authorEmail: string;
  date: number;
  message: string;
  body: string;
  refs: string[];
}

interface SerializedCommitDetail extends SerializedCommit {
  changedFiles: { status: string; path: string }[];
}

interface SerializedTag {
  name: string;
  commit: string;
  label: string;
  date: number;
  annotated: boolean;
  message?: string;
}

interface SerializedStash {
  id: string;
  index: number;
  message: string;
  branch: string;
  date: number;
}

interface SerializedRemote {
  name: string;
  refs: {
    fetch: string;
    push: string;
  };
}

interface LogQueryOptions {
  maxCount?: number;
  branch?: string;
  since?: string;
  author?: string;
  search?: string;
}

interface SelectionRange {
  hunkIndex: number;
  startLine: number;
  endLine: number;
}