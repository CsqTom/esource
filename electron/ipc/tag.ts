import { ipcMain } from "electron";
import { getGit } from "./utils";

export function registerTagHandlers() {
  ipcMain.handle(
    "tag:list",
    async (_event, repoPath: string): Promise<SerializedTag[]> => {
      const git = getGit(repoPath);
      const result = await git.tags();
      const tags: SerializedTag[] = [];
      for (const name of result.all) {
        try {
          const detail = await git.raw([
            "show",
            "--format=%H|%aI|%s",
            "--no-patch",
            "--no-notes",
            // 剥壳附注标签到其指向的提交，避免取到 tag 对象自身的头信息
            `${name}^{commit}`,
          ]);
          const parts = detail.trim().split("|");
          const commit = parts[0] || "";
          // 找出包含该标签所指向提交的分支（本地分支）
          let branches: string[] = [];
          try {
            const contains = await git.raw(["branch", "--contains", commit]);
            branches = contains
              .split("\n")
              .map((l) => l.trim().replace(/^\*\s*/, ""))
              .filter(Boolean);
          } catch {
            // 提交可能已被删除，忽略
          }
          tags.push({
            name,
            commit,
            label: name,
            date: new Date(parts[1] || "").getTime(),
            annotated: false,
            message: parts[2] || "",
            branches,
          });
        } catch {
          tags.push({
            name,
            commit: "",
            label: name,
            date: 0,
            annotated: false,
            branches: [],
          });
        }
      }
      return tags;
    },
  );
  ipcMain.handle(
    "tag:create",
    async (
      _event,
      repoPath: string,
      name: string,
      message?: string,
      commitHash?: string,
    ): Promise<void> => {
      const git = getGit(repoPath);
      // 未指定提交点时打在当前 HEAD
      const target = commitHash || "HEAD";
      if (message) await git.raw(["tag", "-a", name, "-m", message, target]);
      else await git.raw(["tag", name, target]);
    },
  );
  ipcMain.handle(
    "tag:push",
    async (
      _event,
      repoPath: string,
      name: string,
      remote?: string,
    ): Promise<void> => {
      const git = getGit(repoPath);
      let r = remote;
      if (!r) {
        const status = await git.status();
        r = status.tracking ? status.tracking.split("/")[0] : "origin";
      }
      await git.raw(["push", r, name]);
    },
  );
  // 查询默认远程上已存在的标签，用于判断本地标签是否已推送（与 tag:push 的默认远程解析保持一致）
  ipcMain.handle(
    "tag:remoteTags",
    async (
      _event,
      repoPath: string,
    ): Promise<{ remote: string; tags: string[] }> => {
      const git = getGit(repoPath);
      const status = await git.status();
      const target = status.tracking ? status.tracking.split("/")[0] : "origin";
      const remotes = await git.getRemotes();
      // 未配置该远程时返回空 remote，由前端提示"未配置远程仓库"
      if (!remotes.some((r) => r.name === target)) {
        return { remote: "", tags: [] };
      }
      const out = await git.raw(["ls-remote", "--tags", target]);
      // 输出行形如 "<sha>\trefs/tags/v1.0.0"，附注标签另有一行 "<sha>\trefs/tags/v1.0.0^{}"
      const tags = out
        .split("\n")
        .map((line) => line.trim().split("\t")[1] || "")
        .filter((ref) => ref.startsWith("refs/tags/"))
        .map((ref) => ref.slice("refs/tags/".length).replace(/\^\{\}$/, ""));
      return { remote: target, tags: [...new Set(tags)] };
    },
  );
  ipcMain.handle(
    "tag:delete",
    async (_event, repoPath: string, name: string): Promise<void> => {
      await getGit(repoPath).raw(["tag", "-d", name]);
    },
  );
}