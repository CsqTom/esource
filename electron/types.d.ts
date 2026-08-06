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
  tracking?: string; // 跟踪的远程分支（如 'esource/master'）
  ahead?: number; // 领先提交数
  behind?: number; // 落后提交数
  date?: number; // 最后提交时间戳（毫秒）
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
  type: "added" | "removed" | "context";
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
  branches: string[];
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

interface SerializedMergeResult {
  status: "success" | "conflict" | "up-to-date";
  branch: string;
  message: string;
  conflicts?: string[];
  filesAccessed?: string[];
}

interface LogQueryOptions {
  maxCount?: number;
  branch?: string;
  since?: string;
  author?: string;
  search?: string;
  all?: boolean;
}

interface SelectionRange {
  hunkIndex: number;
  startLine: number;
  endLine: number;
}
