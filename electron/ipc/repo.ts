import { ipcMain, dialog, shell } from "electron";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { getGit } from "./utils";
import { loadStore, saveStore } from "./store";
import type { RepoRecord } from "./store";
import { registerWorkdirHandlers } from "./workdir";
import { registerBranchHandlers } from "./branch";
import { registerRemoteHandlers } from "./remote";
import { registerLogHandlers } from "./log";
import { registerTagHandlers } from "./tag";
import { registerStashHandlers } from "./stash";

export function registerRepoHandlers() {
  // ── 注册各子模块 ──
  registerWorkdirHandlers();
  registerBranchHandlers();
  registerRemoteHandlers();
  registerLogHandlers();
  registerTagHandlers();
  registerStashHandlers();

  // ── 仓库管理 ──
  ipcMain.handle("repo:list", async (): Promise<SerializedRepository[]> => {
    const records = loadStore();
    const repos: SerializedRepository[] = [];
    for (const record of records) {
      try {
        if (!fs.existsSync(path.join(record.path, ".git"))) continue;
        const git = getGit(record.path);
        const status = await git.status();
        const remotes = await git.getRemotes(true);
        repos.push({
          id: record.id,
          name: record.name,
          path: record.path,
          currentBranch: status.current || "HEAD",
          isClean: (status.isClean?.() ?? true) && !status.conflicted?.length,
          ahead: status.ahead || 0,
          behind: status.behind || 0,
          remoteUrl: remotes[0]?.refs?.fetch || "",
          addedAt: record.addedAt,
        });
      } catch {
        repos.push({
          id: record.id,
          name: record.name,
          path: record.path,
          currentBranch: "unknown",
          isClean: true,
          ahead: 0,
          behind: 0,
          remoteUrl: "",
          addedAt: record.addedAt,
        });
      }
    }
    return repos;
  });
  ipcMain.handle("repo:add", async (): Promise<SerializedRepository> => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "选择 Git 仓库目录",
    });
    if (result.canceled || !result.filePaths.length)
      throw new Error("用户取消了选择");
    const repoPath = result.filePaths[0];
    if (!fs.existsSync(path.join(repoPath, ".git")))
      throw new Error("所选目录不是一个 Git 仓库（没有 .git 目录）");
    const records = loadStore();
    if (records.find((r) => r.path === repoPath))
      throw new Error("该仓库已经在列表中");
    const record: RepoRecord = {
      id: `repo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: path.basename(repoPath),
      path: repoPath,
      addedAt: Date.now(),
    };
    records.push(record);
    saveStore(records);
    const git = getGit(repoPath);
    const status = await git.status();
    return {
      id: record.id,
      name: record.name,
      path: record.path,
      currentBranch: status.current || "HEAD",
      isClean: (status.isClean?.() ?? true) && !status.conflicted?.length,
      ahead: status.ahead || 0,
      behind: status.behind || 0,
      remoteUrl: "",
      addedAt: record.addedAt,
    };
  });
  ipcMain.handle("repo:remove", async (_event, id: string): Promise<void> => {
    const records = loadStore();
    saveStore(records.filter((r) => r.id !== id));
  });
  ipcMain.handle(
    "repo:clone",
    async (
      _event,
      url: string,
      destPath: string,
    ): Promise<SerializedRepository> => {
      if (!url || !destPath) throw new Error("请提供仓库 URL 和本地路径");
      fs.mkdirSync(destPath, { recursive: true });
      const git = getGit(destPath);
      await git.clone(url, destPath);
      const record: RepoRecord = {
        id: `repo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: path.basename(destPath),
        path: destPath,
        addedAt: Date.now(),
      };
      const records = loadStore();
      records.push(record);
      saveStore(records);
      const repoGit = getGit(destPath);
      const status = await repoGit.status();
      return {
        id: record.id,
        name: record.name,
        path: record.path,
        currentBranch: status.current || "HEAD",
        isClean: (status.isClean?.() ?? true) && !status.conflicted?.length,
        ahead: status.ahead || 0,
        behind: status.behind || 0,
        remoteUrl: url,
        addedAt: record.addedAt,
      };
    },
  );
  ipcMain.handle("repo:init", async (): Promise<SerializedRepository> => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "选择要初始化 Git 仓库的目录",
    });
    if (result.canceled || !result.filePaths.length)
      throw new Error("用户取消了选择");
    const repoPath = result.filePaths[0];
    const git = getGit(repoPath);
    await git.init();
    const record: RepoRecord = {
      id: `repo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: path.basename(repoPath),
      path: repoPath,
      addedAt: Date.now(),
    };
    const records = loadStore();
    records.push(record);
    saveStore(records);
    return {
      id: record.id,
      name: record.name,
      path: record.path,
      currentBranch: "master",
      isClean: true,
      ahead: 0,
      behind: 0,
      remoteUrl: "",
      addedAt: record.addedAt,
    };
  });

  // ── 系统操作（fire-and-forget，避免 renderer 等待阻塞） ──
  ipcMain.handle(
    "shell:openPath",
    async (_event, filePath: string): Promise<void> => {
      const result = await shell.openPath(filePath);
      if (result) throw new Error(result);
    },
  );
  ipcMain.on("shell:showItemInFolder", (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  // ── 文件操作 ──
  ipcMain.handle(
    "file:remove",
    async (_event, repoPath: string, filePath: string): Promise<void> => {
      const fullPath = path.join(repoPath, filePath);
      if (!fs.existsSync(fullPath)) throw new Error("文件不存在: " + filePath);
      fs.unlinkSync(fullPath);
    },
  );

  // ── 终端操作 ──
  ipcMain.handle(
    "shell:openTerminal",
    async (_event, dirPath: string): Promise<void> => {
      const platform = process.platform;
      if (platform === "win32") {
        exec(`start cmd /K "cd /d "${dirPath}""`, { windowsHide: true });
      } else if (platform === "darwin") {
        exec(`open -a Terminal "${dirPath}"`);
      } else {
        exec(`x-terminal-emulator --working-directory="${dirPath}"`, {
          cwd: dirPath,
        });
      }
    },
  );
}