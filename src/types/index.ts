// ── 序列化后的仓库类型 ──
export interface SerializedRepository {
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

// ── 序列化后的分支类型 ──
export interface SerializedBranch {
  name: string;
  current: boolean;
  commit: string;
  label: string;
  remote: boolean;
}

// ── 序列化后的状态类型 ──
export interface SerializedStatus {
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

export interface SerializedStatusFile {
  path: string;
  index: string;
  working_dir: string;
}

// ── 序列化后的 Diff 类型 ──
export interface SerializedDiff {
  file: string;
  hunks: SerializedHunk[];
  added: number;
  removed: number;
}

export interface SerializedHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: SerializedDiffLine[];
}

export interface SerializedDiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

// ── 序列化后的提交类型 ──
export interface SerializedCommit {
  hash: string;
  author: string;
  authorEmail: string;
  date: number; // timestamp
  message: string;
  body: string;
  refs: string[];
}

export interface SerializedCommitDetail extends SerializedCommit {
  changedFiles: { status: string; path: string }[];
}

// ── 标签类型 ──
export interface SerializedTag {
  name: string;
  commit: string;
  label: string;
  date: number;
  annotated: boolean;
  message?: string;
}

// ── Stash 类型 ──
export interface SerializedStash {
  id: string;
  index: number;
  message: string;
  branch: string;
  date: number;
}

export interface SelectionRange {
  hunkIndex: number;
  startLine: number;
  endLine: number;
}

// ── 序列化后的远程仓库类型 ──
export interface SerializedRemote {
  name: string;
  refs: {
    fetch: string;
    push: string;
  };
}

// ── 查询选项 ──
export interface LogQueryOptions {
  maxCount?: number;
  branch?: string;
  since?: string;
  author?: string;
  search?: string;
}

// ── 文件变更项（业务层组装后的类型） ──
export interface FileChangeItem {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'conflicted' | 'untracked';
  staged: boolean;
  oldPath?: string;
}

// ── Electron API 类型 ──
export interface ElectronAPI {
  repo: {
    list(): Promise<SerializedRepository[]>;
    add(): Promise<SerializedRepository>;
    remove(id: string): Promise<void>;
    clone(url: string, destPath: string): Promise<SerializedRepository>;
    init(): Promise<SerializedRepository>;
  };
  branch: {
    list(repoPath: string): Promise<SerializedBranch[]>;
    checkout(repoPath: string, branchName: string): Promise<void>;
    create(repoPath: string, name: string, base?: string): Promise<void>;
    delete(repoPath: string, name: string): Promise<void>;
    merge(repoPath: string, branch: string): Promise<string>;
  };
  workdir: {
    status(repoPath: string): Promise<SerializedStatus>;
    stage(repoPath: string, files: string[]): Promise<void>;
    unstage(repoPath: string, files: string[]): Promise<void>;
    discard(repoPath: string, files: string[]): Promise<void>;
    stageAll(repoPath: string): Promise<void>;
    unstageAll(repoPath: string): Promise<void>;
    stageHunk(repoPath: string, file: string, hunkIndex: number): Promise<void>;
    unstageHunk(repoPath: string, file: string, hunkIndex: number): Promise<void>;
    diff(repoPath: string, file: string, staged?: boolean): Promise<SerializedDiff>;
    stageLines(repoPath: string, file: string, selections: SelectionRange[]): Promise<void>;
    unstageLines(repoPath: string, file: string, selections: SelectionRange[]): Promise<void>;
    discardLines(repoPath: string, file: string, selections: SelectionRange[]): Promise<void>;
    commit(repoPath: string, message: string): Promise<void>;
  };
  remote: {
    list(repoPath: string): Promise<SerializedRemote[]>;
    push(repoPath: string, remote?: string, branch?: string): Promise<void>;
    pull(repoPath: string, remote?: string, branch?: string): Promise<void>;
    fetch(repoPath: string, remote?: string): Promise<void>;
    add(repoPath: string, name: string, url: string): Promise<void>;
    remove(repoPath: string, name: string): Promise<void>;
    rename(repoPath: string, oldName: string, newName: string): Promise<void>;
    setUrl(repoPath: string, name: string, url: string, push?: boolean): Promise<void>;
  };
  log: {
    list(repoPath: string, options?: LogQueryOptions): Promise<SerializedCommit[]>;
    raw(repoPath: string, options?: LogQueryOptions): Promise<string>;
    detail(repoPath: string, hash: string): Promise<SerializedCommitDetail>;
  };
  tag: {
    list(repoPath: string): Promise<SerializedTag[]>;
    create(repoPath: string, name: string, message?: string): Promise<void>;
    delete(repoPath: string, name: string): Promise<void>;
  };
  stash: {
    list(repoPath: string): Promise<SerializedStash[]>;
    save(repoPath: string, message?: string): Promise<void>;
    pop(repoPath: string, index?: number): Promise<void>;
    apply(repoPath: string, index: number): Promise<void>;
    drop(repoPath: string, index: number): Promise<void>;
  };
}

export {};