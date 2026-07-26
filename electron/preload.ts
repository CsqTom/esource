import { contextBridge, ipcRenderer } from "electron";
const electronAPI = {
  repo: {
    list: (): Promise<SerializedRepository[]> =>
      ipcRenderer.invoke("repo:list"),
    add: (): Promise<SerializedRepository> => ipcRenderer.invoke("repo:add"),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke("repo:remove", id),
    clone: (url: string, destPath: string): Promise<SerializedRepository> =>
      ipcRenderer.invoke("repo:clone", url, destPath),
    init: (): Promise<SerializedRepository> => ipcRenderer.invoke("repo:init"),
  },
  branch: {
    list: (repoPath: string): Promise<SerializedBranch[]> =>
      ipcRenderer.invoke("branch:list", repoPath),
    checkout: (repoPath: string, branchName: string): Promise<void> =>
      ipcRenderer.invoke("branch:checkout", repoPath, branchName),
    checkoutRemote: (
      repoPath: string,
      remoteBranchName: string,
    ): Promise<{ localName: string; created: boolean }> =>
      ipcRenderer.invoke("branch:checkoutRemote", repoPath, remoteBranchName),
    checkoutWithStash: (
      repoPath: string,
      branchName: string,
      remoteBranchName?: string,
    ): Promise<void> =>
      ipcRenderer.invoke(
        "branch:checkoutWithStash",
        repoPath,
        branchName,
        remoteBranchName,
      ),
    checkoutWithDiscard: (
      repoPath: string,
      branchName: string,
      remoteBranchName?: string,
    ): Promise<void> =>
      ipcRenderer.invoke(
        "branch:checkoutWithDiscard",
        repoPath,
        branchName,
        remoteBranchName,
      ),
    create: (repoPath: string, name: string, base?: string): Promise<void> =>
      ipcRenderer.invoke("branch:create", repoPath, name, base),
    delete: (repoPath: string, name: string): Promise<void> =>
      ipcRenderer.invoke("branch:delete", repoPath, name),
    merge: (repoPath: string, branch: string): Promise<string> =>
      ipcRenderer.invoke("branch:merge", repoPath, branch),
  },
  workdir: {
    status: (repoPath: string): Promise<SerializedStatus> =>
      ipcRenderer.invoke("workdir:status", repoPath),
    stage: (repoPath: string, files: string[]): Promise<void> =>
      ipcRenderer.invoke("workdir:stage", repoPath, files),
    unstage: (repoPath: string, files: string[]): Promise<void> =>
      ipcRenderer.invoke("workdir:unstage", repoPath, files),
    discard: (repoPath: string, files: string[]): Promise<void> =>
      ipcRenderer.invoke("workdir:discard", repoPath, files),
    stageAll: (repoPath: string): Promise<void> =>
      ipcRenderer.invoke("workdir:stageAll", repoPath),
    unstageAll: (repoPath: string): Promise<void> =>
      ipcRenderer.invoke("workdir:unstageAll", repoPath),
    stageHunk: (
      repoPath: string,
      file: string,
      hunkIndex: number,
    ): Promise<void> =>
      ipcRenderer.invoke("workdir:stageHunk", repoPath, file, hunkIndex),
    unstageHunk: (
      repoPath: string,
      file: string,
      hunkIndex: number,
    ): Promise<void> =>
      ipcRenderer.invoke("workdir:unstageHunk", repoPath, file, hunkIndex),
    diff: (
      repoPath: string,
      file: string,
      staged?: boolean,
    ): Promise<SerializedDiff> =>
      ipcRenderer.invoke("workdir:diff", repoPath, file, staged),
    readFile: (
      repoPath: string,
      file: string,
      asBase64?: boolean,
    ): Promise<string> =>
      ipcRenderer.invoke("workdir:readFile", repoPath, file, asBase64),
    stageLines: (
      repoPath: string,
      file: string,
      selections: SelectionRange[],
    ): Promise<void> =>
      ipcRenderer.invoke("workdir:stageLines", repoPath, file, selections),
    unstageLines: (
      repoPath: string,
      file: string,
      selections: SelectionRange[],
    ): Promise<void> =>
      ipcRenderer.invoke("workdir:unstageLines", repoPath, file, selections),
    discardLines: (
      repoPath: string,
      file: string,
      selections: SelectionRange[],
    ): Promise<void> =>
      ipcRenderer.invoke("workdir:discardLines", repoPath, file, selections),
    commit: (repoPath: string, message: string): Promise<void> =>
      ipcRenderer.invoke("workdir:commit", repoPath, message),
  },
  remote: {
    list: (repoPath: string): Promise<SerializedRemote[]> =>
      ipcRenderer.invoke("remote:list", repoPath),
    push: (repoPath: string, remote?: string, branch?: string): Promise<void> =>
      ipcRenderer.invoke("remote:push", repoPath, remote, branch),
    pull: (repoPath: string, remote?: string, branch?: string): Promise<void> =>
      ipcRenderer.invoke("remote:pull", repoPath, remote, branch),
    pullWithStash: (
      repoPath: string,
      remote?: string,
      branch?: string,
    ): Promise<void> =>
      ipcRenderer.invoke("remote:pullWithStash", repoPath, remote, branch),
    pullWithDiscard: (
      repoPath: string,
      remote?: string,
      branch?: string,
    ): Promise<void> =>
      ipcRenderer.invoke("remote:pullWithDiscard", repoPath, remote, branch),
    fetch: (repoPath: string, remote?: string): Promise<void> =>
      ipcRenderer.invoke("remote:fetch", repoPath, remote),
    add: (repoPath: string, name: string, url: string): Promise<void> =>
      ipcRenderer.invoke("remote:add", repoPath, name, url),
    remove: (repoPath: string, name: string): Promise<void> =>
      ipcRenderer.invoke("remote:remove", repoPath, name),
    rename: (
      repoPath: string,
      oldName: string,
      newName: string,
    ): Promise<void> =>
      ipcRenderer.invoke("remote:rename", repoPath, oldName, newName),
    setUrl: (
      repoPath: string,
      name: string,
      url: string,
      push?: boolean,
    ): Promise<void> =>
      ipcRenderer.invoke("remote:setUrl", repoPath, name, url, push),
  },
  log: {
    list: (
      repoPath: string,
      options?: LogQueryOptions,
    ): Promise<SerializedCommit[]> =>
      ipcRenderer.invoke("log:list", repoPath, options),
    raw: (repoPath: string, options?: LogQueryOptions): Promise<string> =>
      ipcRenderer.invoke("log:raw", repoPath, options),
    detail: (repoPath: string, hash: string): Promise<SerializedCommitDetail> =>
      ipcRenderer.invoke("log:detail", repoPath, hash),
    fileDiff: (
      repoPath: string,
      hash: string,
      filePath: string,
    ): Promise<SerializedDiff> =>
      ipcRenderer.invoke("log:fileDiff", repoPath, hash, filePath),
    graphJson: (repoPath: string, maxCount?: number): Promise<any[]> =>
      ipcRenderer.invoke("log:graphJson", repoPath, maxCount),
  },
  tag: {
    list: (repoPath: string): Promise<SerializedTag[]> =>
      ipcRenderer.invoke("tag:list", repoPath),
    create: (repoPath: string, name: string, message?: string): Promise<void> =>
      ipcRenderer.invoke("tag:create", repoPath, name, message),
    delete: (repoPath: string, name: string): Promise<void> =>
      ipcRenderer.invoke("tag:delete", repoPath, name),
  },
  git: {
    setCredential: (repoPath: string, remote: string, url: string, username: string, password: string): Promise<void> =>
      ipcRenderer.invoke("git:setCredential", repoPath, remote, url, username, password),
  },
  stash: {
    list: (repoPath: string): Promise<SerializedStash[]> =>
      ipcRenderer.invoke("stash:list", repoPath),
    save: (repoPath: string, message?: string): Promise<void> =>
      ipcRenderer.invoke("stash:save", repoPath, message),
    pop: (repoPath: string, index?: number): Promise<void> =>
      ipcRenderer.invoke("stash:pop", repoPath, index),
    apply: (repoPath: string, index: number): Promise<void> =>
      ipcRenderer.invoke("stash:apply", repoPath, index),
    drop: (repoPath: string, index: number): Promise<void> =>
      ipcRenderer.invoke("stash:drop", repoPath, index),
  },
  shell: {
    openPath: (filePath: string): Promise<void> =>
      ipcRenderer.invoke("shell:openPath", filePath),
    showItemInFolder: (filePath: string): void => {
      ipcRenderer.send("shell:showItemInFolder", filePath);
    },
    openTerminal: (dirPath: string): Promise<void> =>
      ipcRenderer.invoke("shell:openTerminal", dirPath),
  },
  file: {
    remove: (repoPath: string, filePath: string): Promise<void> =>
      ipcRenderer.invoke("file:remove", repoPath, filePath),
  },
};
contextBridge.exposeInMainWorld("electronAPI", electronAPI);
