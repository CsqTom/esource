import { contextBridge, ipcRenderer } from 'electron';

/**
 * 序列化边界
 *
 * 所有通过 IPC 传输的数据都必须是纯 JSON 可序列化的。
 * 主进程的 handler 负责将 Node.js 对象（如 Stats, StatusSummary 等）
 * 转换为纯对象后再返回。这里不做额外转换，只做类型安全的透传。
 */

const electronAPI = {
  // ─── 仓库管理 ───
  repo: {
    list: (): Promise<SerializedRepository[]> =>
      ipcRenderer.invoke('repo:list'),
    add: (repoPath: string): Promise<SerializedRepository> =>
      ipcRenderer.invoke('repo:add', repoPath),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke('repo:remove', id),
    clone: (url: string, destPath: string): Promise<SerializedRepository> =>
      ipcRenderer.invoke('repo:clone', url, destPath),
    init: (repoPath: string): Promise<SerializedRepository> =>
      ipcRenderer.invoke('repo:init', repoPath),
  },

  // ─── 分支操作 ───
  branch: {
    list: (repoPath: string): Promise<SerializedBranch[]> =>
      ipcRenderer.invoke('branch:list', repoPath),
    checkout: (repoPath: string, branchName: string): Promise<void> =>
      ipcRenderer.invoke('branch:checkout', repoPath, branchName),
    create: (repoPath: string, name: string, base?: string): Promise<void> =>
      ipcRenderer.invoke('branch:create', repoPath, name, base),
    delete: (repoPath: string, name: string): Promise<void> =>
      ipcRenderer.invoke('branch:delete', repoPath, name),
    merge: (repoPath: string, branch: string): Promise<string> =>
      ipcRenderer.invoke('branch:merge', repoPath, branch),
  },

  // ─── 工作区操作 ───
  workdir: {
    status: (repoPath: string): Promise<SerializedStatus> =>
      ipcRenderer.invoke('workdir:status', repoPath),
    stage: (repoPath: string, files: string[]): Promise<void> =>
      ipcRenderer.invoke('workdir:stage', repoPath, files),
    unstage: (repoPath: string, files: string[]): Promise<void> =>
      ipcRenderer.invoke('workdir:unstage', repoPath, files),
    discard: (repoPath: string, files: string[]): Promise<void> =>
      ipcRenderer.invoke('workdir:discard', repoPath, files),
    stageAll: (repoPath: string): Promise<void> =>
      ipcRenderer.invoke('workdir:stageAll', repoPath),
    unstageAll: (repoPath: string): Promise<void> =>
      ipcRenderer.invoke('workdir:unstageAll', repoPath),
    stageHunk: (repoPath: string, file: string, hunkIndex: number): Promise<void> =>
      ipcRenderer.invoke('workdir:stageHunk', repoPath, file, hunkIndex),
    unstageHunk: (repoPath: string, file: string, hunkIndex: number): Promise<void> =>
      ipcRenderer.invoke('workdir:unstageHunk', repoPath, file, hunkIndex),
    diff: (repoPath: string, file: string, staged?: boolean): Promise<SerializedDiff> =>
      ipcRenderer.invoke('workdir:diff', repoPath, file, staged),
    commit: (repoPath: string, message: string): Promise<void> =>
      ipcRenderer.invoke('workdir:commit', repoPath, message),
  },

  // ─── 远程操作 ───
  remote: {
    list: (repoPath: string): Promise<SerializedRemote[]> =>
      ipcRenderer.invoke('remote:list', repoPath),
    push: (repoPath: string, remote?: string, branch?: string): Promise<void> =>
      ipcRenderer.invoke('remote:push', repoPath, remote, branch),
    pull: (repoPath: string, remote?: string, branch?: string): Promise<void> =>
      ipcRenderer.invoke('remote:pull', repoPath, remote, branch),
    fetch: (repoPath: string, remote?: string): Promise<void> =>
      ipcRenderer.invoke('remote:fetch', repoPath, remote),
  },

  // ─── 提交历史 ───
  log: {
    list: (repoPath: string, options?: LogQueryOptions): Promise<SerializedCommit[]> =>
      ipcRenderer.invoke('log:list', repoPath, options),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);