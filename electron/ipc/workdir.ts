import { ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { getGit, serializeStatus, parseHunks, buildPatch, reverseHunk, parseDiff, buildPartialPatch, applyPatchFromFile } from "./utils";
import { getGitignorePath, ensureGitignore } from "./gitignore";

export function registerWorkdirHandlers() {
  ipcMain.handle(
    "workdir:status",
    async (_event, repoPath: string): Promise<SerializedStatus> => {
      const git = getGit(repoPath);
      return serializeStatus(await git.status());
    },
  );
  ipcMain.handle(
    "workdir:stage",
    async (_event, repoPath: string, files: string[]): Promise<void> => {
      await getGit(repoPath).add(files);
    },
  );
  ipcMain.handle(
    "workdir:unstage",
    async (_event, repoPath: string, files: string[]): Promise<void> => {
      await getGit(repoPath).reset(["--", ...files]);
    },
  );
  ipcMain.handle(
    "workdir:discard",
    async (_event, repoPath: string, files: string[]): Promise<void> => {
      await getGit(repoPath).checkout(["--", ...files]);
    },
  );
  ipcMain.handle(
    "workdir:stageAll",
    async (_event, repoPath: string): Promise<void> => {
      await getGit(repoPath).add(".");
    },
  );
  ipcMain.handle(
    "workdir:unstageAll",
    async (_event, repoPath: string): Promise<void> => {
      await getGit(repoPath).reset(["--", "."]);
    },
  );
  ipcMain.handle(
    "workdir:stageHunk",
    async (
      _event,
      repoPath: string,
      file: string,
      hunkIndex: number,
    ): Promise<void> => {
      const git = getGit(repoPath);
      const diff = await git.diff(["--unified=999999", "--", file]);
      const hunks = parseHunks(diff);
      if (hunks.length <= hunkIndex)
        throw new Error(`Hunk index ${hunkIndex} out of range`);
      await git.applyPatch(buildPatch(file, hunks[hunkIndex]), ["--cached"]);
    },
  );
  ipcMain.handle(
    "workdir:unstageHunk",
    async (
      _event,
      repoPath: string,
      file: string,
      hunkIndex: number,
    ): Promise<void> => {
      const git = getGit(repoPath);
      const diff = await git.diff(["--cached", "--unified=999999", "--", file]);
      const hunks = parseHunks(diff);
      if (hunks.length <= hunkIndex)
        throw new Error(`Hunk index ${hunkIndex} out of range`);
      await git.applyPatch(buildPatch(file, reverseHunk(hunks[hunkIndex])), [
        "--cached",
      ]);
    },
  );
  ipcMain.handle(
    "workdir:diff",
    async (
      _event,
      repoPath: string,
      file: string,
      staged: boolean = false,
    ): Promise<SerializedDiff> => {
      return parseDiff(
        await getGit(repoPath).diff(staged ? ["--cached", "--", file] : ["--", file]),
        file,
      );
    },
  );
  ipcMain.handle(
    "workdir:readFile",
    async (
      _event,
      repoPath: string,
      file: string,
      asBase64: boolean = false,
    ): Promise<string> => {
      const fullPath = path.join(repoPath, file);
      if (!fs.existsSync(fullPath)) throw new Error("文件不存在: " + file);
      if (asBase64) {
        return fs.readFileSync(fullPath).toString("base64");
      }
      return fs.readFileSync(fullPath, "utf-8");
    },
  );
  ipcMain.handle(
    "workdir:getFileSize",
    async (_event, repoPath: string, file: string): Promise<number> => {
      const fullPath = path.join(repoPath, file);
      if (!fs.existsSync(fullPath)) return -1;
      return fs.statSync(fullPath).size;
    },
  );
  ipcMain.handle(
    "workdir:stageLines",
    async (
      _event,
      repoPath: string,
      file: string,
      selections: SelectionRange[],
    ): Promise<void> => {
      const git = getGit(repoPath);
      const diffStr = await git.diff(["--", file]);
      const patch = buildPartialPatch(file, diffStr, selections);
      if (patch) await applyPatchFromFile(git, patch, ["--cached"]);
    },
  );
  ipcMain.handle(
    "workdir:unstageLines",
    async (
      _event,
      repoPath: string,
      file: string,
      selections: SelectionRange[],
    ): Promise<void> => {
      const git = getGit(repoPath);
      const diffStr = await git.diff(["--cached", "-R", "--", file]);
      const patch = buildPartialPatch(file, diffStr, selections);
      if (patch) await applyPatchFromFile(git, patch, ["--cached"]);
    },
  );
  ipcMain.handle(
    "workdir:discardLines",
    async (
      _event,
      repoPath: string,
      file: string,
      selections: SelectionRange[],
    ): Promise<void> => {
      const git = getGit(repoPath);
      const diffStr = await git.diff(["-R", "--", file]);
      const patch = buildPartialPatch(file, diffStr, selections);
      if (patch) await applyPatchFromFile(git, patch, []);
    },
  );
  ipcMain.handle(
    "workdir:commit",
    async (_event, repoPath: string, message: string): Promise<void> => {
      if (!message?.trim()) throw new Error("提交信息不能为空");
      await getGit(repoPath).commit(message);
    },
  );

  // ── .gitignore 操作 ──

  ipcMain.handle(
    "workdir:addToGitignore",
    async (_event, repoPath: string, rules: string[]): Promise<void> => {
      const gitignorePath = getGitignorePath(repoPath);
      const existing = ensureGitignore(repoPath);
      // 去重：已存在的规则不再追加
      const existingLines = new Set(
        existing.split("\n").map((l) => l.trim()).filter(Boolean),
      );
      const toAdd = rules
        .map((r) => r.trim())
        .filter((r) => r && !existingLines.has(r));
      if (toAdd.length === 0) return;
      const content = existing.endsWith("\n") ? existing : existing + "\n";
      fs.appendFileSync(gitignorePath, toAdd.join("\n") + "\n", "utf-8");
    },
  );

  ipcMain.handle(
    "workdir:listAncestorDirs",
    async (_event, repoPath: string, filePath: string): Promise<string[]> => {
      // 返回文件路径中所有祖先目录（相对于 repo 根）
      const dirs: string[] = [];
      const parts = filePath.replace(/\\/g, "/").split("/");
      for (let i = parts.length - 1; i > 0; i--) {
        dirs.push(parts.slice(0, i).join("/"));
      }
      // 如果文件在子目录中，dirs 至少包含一个父目录
      // 如果文件在根目录，dirs 为空，至少要包含 "."
      if (dirs.length === 0) dirs.push(".");
      return dirs;
    },
  );
}