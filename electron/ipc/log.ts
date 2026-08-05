import { ipcMain } from "electron";
import { getGit, parseLogOutput, parseDiff } from "./utils";

export function registerLogHandlers() {
  // ── 获取指定提交在 --all --date-order 日志中的行索引（0 起），用于日志跳转定位 ──
  ipcMain.handle(
    "log:position",
    async (_event, repoPath: string, hash: string): Promise<number> => {
      const raw = await getGit(repoPath).raw([
        "log",
        "--all",
        "--date-order",
        "--format=%H",
      ]);
      const lines = raw.split("\n").filter(Boolean);
      return lines.indexOf(hash); // 找不到返回 -1
    },
  );
  // ── 获取当前分支最近 N 条提交信息（用于提交框快速选择） ──
  ipcMain.handle(
    "log:recentMessages",
    async (_event, repoPath: string): Promise<string[]> => {
      const raw = await getGit(repoPath).raw([
        "log",
        "--format=%s",
        "--max-count=10",
        "HEAD",
      ]);
      return raw.split("\n").filter(Boolean);
    },
  );
  ipcMain.handle(
    "log:list",
    async (
      _event,
      repoPath: string,
      options?: LogQueryOptions,
    ): Promise<SerializedCommit[]> => {
      const opts: string[] = [`--max-count=${options?.maxCount || 50}`];
      if (options?.author) opts.push(`--author=${options.author}`);
      if (options?.since) opts.push(`--since=${options.since}`);
      if (options?.all)
        opts.push(
          "--decorate",
          "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D",
          "--date-order",
        );
      else
        opts.push(
          "--decorate",
          "--decorate-refs-exclude=refs/remotes/",
          "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D",
          "--date-order",
        );
      if (options?.all) opts.push("--all");
      else if (options?.branch) opts.push(options.branch);
      else opts.push("HEAD");
      const raw = await getGit(repoPath).raw(["log", ...opts]);
      return parseLogOutput(raw);
    },
  );
  ipcMain.handle(
    "log:graphJson",
    async (
      _event,
      repoPath: string,
      maxCount: number = 200,
    ): Promise<any[]> => {
      const result = await getGit(repoPath).raw([
        "log",
        `--max-count=${maxCount}`,
        "--all",
        "--decorate",
        "--decorate-refs-exclude=refs/remotes/",
        "--format=%H|||%P|||%an|||%ae|||%aI|||%cn|||%ce|||%cI|||%s|||%D",
      ]);
      const commits: any[] = [];
      for (const line of result.split("\n").filter(Boolean)) {
        const parts = line.split("|||");
        if (parts.length < 10) continue;
        commits.push({
          hash: parts[0],
          parents: parts[1] ? parts[1].split(" ").filter(Boolean) : [],
          author: {
            name: parts[2],
            email: parts[3],
            timestamp: new Date(parts[4]).getTime() / 1000,
          },
          committer: {
            name: parts[5],
            email: parts[6],
            timestamp: new Date(parts[7]).getTime() / 1000,
          },
          message: parts[8],
          refs: (parts[9] || "").split(", ").filter(Boolean),
        });
      }
      return commits;
    },
  );
  ipcMain.handle(
    "log:raw",
    async (
      _event,
      repoPath: string,
      options?: LogQueryOptions,
    ): Promise<string> => {
      const opts: string[] = [`--max-count=${options?.maxCount || 100}`];
      if (options?.branch) opts.push(options.branch);
      if (options?.author) opts.push(`--author=${options.author}`);
      if (options?.since) opts.push(`--since=${options.since}`);
      if (options?.search) opts.push(`--grep=${options.search}`);
      opts.push("--all", "--graph", "--decorate", "--oneline");
      return await getGit(repoPath).raw(["log", ...opts]);
    },
  );
  ipcMain.handle(
    "log:detail",
    async (
      _event,
      repoPath: string,
      hash: string,
    ): Promise<SerializedCommitDetail> => {
      const git = getGit(repoPath);
      const result = await git.raw([
        "show",
        '--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1f%D", "--no-patch',
        hash,
      ]);
      const parts = result.split("\n").filter(Boolean)[0]?.split("\x1f") || [];
      const files = await git.raw([
        "diff-tree",
        "--no-commit-id",
        "-r",
        "--name-status",
        hash,
      ]);
      const changedFiles = files
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [status, ...pathParts] = line.trim().split("\t");
          return { status: status || "M", path: pathParts.join("/") || "" };
        });
      return {
        hash: parts[0] || "",
        author: parts[1] || "",
        authorEmail: parts[2] || "",
        date: new Date(parts[3] || "").getTime(),
        message: parts[4] || "",
        body: parts[5] || "",
        refs: parts[6] ? parts[6].split(", ").filter(Boolean) : [],
        changedFiles,
      };
    },
  );
  ipcMain.handle(
    "log:fileDiff",
    async (
      _event,
      repoPath: string,
      hash: string,
      filePath: string,
    ): Promise<SerializedDiff> => {
      const diffStr = await getGit(repoPath).raw([
        "diff-tree",
        "--no-commit-id",
        "-p",
        hash,
        "--",
        filePath,
      ]);
      return parseDiff(diffStr, filePath);
    },
  );
}