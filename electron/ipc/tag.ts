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
    ): Promise<void> => {
      const git = getGit(repoPath);
      if (message) await git.raw(["tag", "-a", name, "-m", message]);
      else await git.raw(["tag", name]);
    },
  );
  ipcMain.handle(
    "tag:delete",
    async (_event, repoPath: string, name: string): Promise<void> => {
      await getGit(repoPath).raw(["tag", "-d", name]);
    },
  );
}