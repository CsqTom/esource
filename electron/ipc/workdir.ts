import { ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { getGit, serializeStatus, parseHunks, buildPatch, reverseHunk, parseDiff, buildPartialPatch, applyPatchFromFile, reversePatch, applyPatchToContent, writeToIndex, detectGitOperation, readMergeSource, parseConflictSegments } from "./utils";
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
      // 从前端展示的正向 diff 构建局部补丁后整体反转应用。
      // 不能用 git diff -R 重新生成：反向 diff 会把删除块重排到新增块之前，
      // 与前端基于正向 diff 的行选择错位，导致补丁内容错误或应用失败。
      const diffStr = await git.diff(["--cached", "--", file]);
      const patch = buildPartialPatch(file, diffStr, selections);
      if (patch) await applyPatchFromFile(git, reversePatch(patch), ["--cached"]);
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
      // 同 unstageLines：从正向 diff 构建补丁后反转，避免 -R diff 行序重排导致的错位
      const diffStr = await git.diff(["--", file]);
      const patch = buildPartialPatch(file, diffStr, selections);
      if (patch) await applyPatchFromFile(git, reversePatch(patch), []);
    },
  );
  ipcMain.handle(
    "workdir:commit",
    async (_event, repoPath: string, message: string): Promise<void> => {
      if (!message?.trim()) throw new Error("提交信息不能为空");
      await getGit(repoPath).commit(message);
    },
  );

  // ── 冲突解决 ──

  // 进行中的合并/变基/cherry-pick 状态（用于冲突面板标题与"中止"操作）
  ipcMain.handle(
    "workdir:conflictState",
    async (_event, repoPath: string): Promise<SerializedConflictState> => {
      return {
        operation: detectGitOperation(repoPath),
        source: readMergeSource(repoPath),
      };
    },
  );

  // 读取冲突文件的工作区内容并解析为 normal/conflict 段
  ipcMain.handle(
    "workdir:conflictDetail",
    async (
      _event,
      repoPath: string,
      file: string,
    ): Promise<SerializedConflictDetail> => {
      const fullPath = path.join(repoPath, file);
      if (!fs.existsSync(fullPath)) throw new Error("文件不存在: " + file);
      const content = fs.readFileSync(fullPath, "utf-8");
      const { hasMarkers, segments } = parseConflictSegments(content);
      // ConflictSegmentData 运行时结构与共享的 ConflictSegment 一致（conflict 段必含 ours/theirs），仅类型判别写法不同
      return {
        file,
        hasMarkers,
        segments: segments as unknown as SerializedConflictDetail["segments"],
      };
    },
  );

  // 整文件快速解决：保留我方/对方版本并暂存（标记已解决）
  ipcMain.handle(
    "workdir:resolveConflict",
    async (
      _event,
      repoPath: string,
      file: string,
      resolution: "ours" | "theirs",
    ): Promise<void> => {
      const git = getGit(repoPath);
      await git.raw(["checkout", `--${resolution}`, "--", file]);
      await git.add(file);
    },
  );

  // 逐块解决：把文件中第 blockIndex 个冲突块替换为所选一侧（或两侧都保留）
  ipcMain.handle(
    "workdir:resolveConflictBlock",
    async (
      _event,
      repoPath: string,
      file: string,
      blockIndex: number,
      side: "ours" | "theirs" | "both",
    ): Promise<void> => {
      const fullPath = path.join(repoPath, file);
      if (!fs.existsSync(fullPath)) throw new Error("文件不存在: " + file);
      const content = fs.readFileSync(fullPath, "utf-8");
      const eol = content.includes("\r\n") ? "\r\n" : "\n";
      const { segments } = parseConflictSegments(content);
      let seen = -1;
      const out: string[] = [];
      for (const seg of segments) {
        if (seg.type !== "conflict") {
          out.push(...(seg.lines || []));
          continue;
        }
        seen++;
        if (seen === blockIndex) {
          if (side === "ours") out.push(...(seg.ours || []));
          else if (side === "theirs") out.push(...(seg.theirs || []));
          else out.push(...(seg.ours || []), ...(seg.theirs || []));
        } else {
          out.push(...(seg.raw || []));
        }
      }
      if (seen < blockIndex) throw new Error(`冲突块 ${blockIndex} 不存在`);
      fs.writeFileSync(fullPath, out.join(eol), "utf-8");
    },
  );

  // 中止进行中的合并/变基/cherry-pick
  ipcMain.handle(
    "workdir:abortConflictOperation",
    async (_event, repoPath: string): Promise<void> => {
      const git = getGit(repoPath);
      const operation = detectGitOperation(repoPath);
      if (operation === "rebase") await git.rebase(["--abort"]);
      else if (operation === "cherry-pick") await git.raw(["cherry-pick", "--abort"]);
      else if (operation === "merge") await git.raw(["merge", "--abort"]);
      else throw new Error("当前没有进行中的合并操作");
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