import { ipcMain } from "electron";
import { getGit, resolveRemoteBranch, stripCredentialsFromUrl } from "./utils";

export function registerRemoteHandlers() {
  ipcMain.handle(
    "remote:list",
    async (_event, repoPath: string): Promise<SerializedRemote[]> => {
      return (await getGit(repoPath).getRemotes(true)).map((r) => ({
        name: r.name,
        refs: { fetch: stripCredentialsFromUrl(r.refs?.fetch || ""), push: stripCredentialsFromUrl(r.refs?.push || "") },
      }));
    },
  );
  ipcMain.handle(
    "remote:push",
    async (
      _event,
      repoPath: string,
      remote?: string,
      branch?: string,
    ): Promise<void> => {
      const git = getGit(repoPath);
      const { remote: r, branch: b } = await resolveRemoteBranch(
        repoPath,
        remote,
        branch,
      );
      await git.push(["-u", r, b]);
      console.log(`已推送并建立跟踪关系: ${b} -> ${r}/${b}`);
    },
  );
  ipcMain.handle(
    "remote:pull",
    async (
      _event,
      repoPath: string,
      remote?: string,
      branch?: string,
    ): Promise<void> => {
      const git = getGit(repoPath);
      const { remote: r, branch: b } = await resolveRemoteBranch(
        repoPath,
        remote,
        branch,
      );
      const status = await git.status();
      const currentBranch = status.current;
      await git.pull(r, b);
      if (currentBranch && !status.tracking) {
        try {
          await git.branch(["--set-upstream-to", `${r}/${b}`, currentBranch]);
          console.log(`已建立跟踪关系: ${currentBranch} -> ${r}/${b}`);
        } catch (err) {
          console.error("建立跟踪关系失败:", err);
        }
      }
    },
  );
  ipcMain.handle(
    "remote:fetch",
    async (_event, repoPath: string, remote?: string): Promise<void> => {
      const git = getGit(repoPath);
      if (remote) {
        await git.fetch(remote);
        return;
      }
      const status = await git.status();
      const r = status.tracking ? status.tracking.split("/")[0] : "origin";
      await git.fetch(r);
    },
  );
  ipcMain.handle(
    "remote:add",
    async (
      _event,
      repoPath: string,
      name: string,
      url: string,
    ): Promise<void> => {
      await getGit(repoPath).raw(["remote", "add", name, url]);
    },
  );
  ipcMain.handle(
    "remote:remove",
    async (_event, repoPath: string, name: string): Promise<void> => {
      await getGit(repoPath).raw(["remote", "remove", name]);
    },
  );
  ipcMain.handle(
    "remote:rename",
    async (
      _event,
      repoPath: string,
      oldName: string,
      newName: string,
    ): Promise<void> => {
      await getGit(repoPath).raw(["remote", "rename", oldName, newName]);
    },
  );
  ipcMain.handle(
    "remote:setUrl",
    async (
      _event,
      repoPath: string,
      name: string,
      url: string,
      push?: boolean,
    ): Promise<void> => {
      await getGit(repoPath).raw([
        "remote",
        ...(push ? ["set-url", "--push", name, url] : ["set-url", name, url]),
      ]);
    },
  );
  // 组合操作：stash -> pull -> pop（用于解决拉取冲突）
  ipcMain.handle(
    "remote:pullWithStash",
    async (
      _event,
      repoPath: string,
      remote?: string,
      branch?: string,
    ): Promise<void> => {
      const git = getGit(repoPath);
      const { remote: r, branch: b } = await resolveRemoteBranch(
        repoPath,
        remote,
        branch,
      );
      const statusBeforePull = await git.status();
      const currentBranch = statusBeforePull.current;
      await git.raw([
        "stash",
        "push",
        "-m",
        `Auto-stash before pull from ${r}/${b}`,
      ]);
      // 仅当确实生成了 stash 条目时才需要恢复（无改动时 push 是空操作）
      const stashed = (await git.stashList()).total > 0;
      try {
        await git.pull(r, b);
        if (currentBranch && !statusBeforePull.tracking) {
          try {
            await git.branch(["--set-upstream-to", `${r}/${b}`, currentBranch]);
            console.log(`已建立跟踪关系: ${currentBranch} -> ${r}/${b}`);
          } catch (err) {
            console.error("建立跟踪关系失败:", err);
          }
        }
      } catch (pullErr) {
        // 拉取失败（多为合并冲突）：先尽量恢复暂存的本地改动，再抛出
        if (stashed) {
          try {
            await git.raw(["stash", "pop"]);
          } catch {
            // 恢复本身也冲突：改动已回到工作区（含冲突标记），stash 条目仍保留
          }
        }
        throw pullErr;
      }
      if (stashed) {
        try {
          await git.raw(["stash", "pop"]);
        } catch (popErr) {
          console.error("Stash pop 冲突:", popErr);
          throw new Error(
            "拉取完成，但恢复暂存改动（stash pop）时发生冲突。\n" +
              "冲突文件已标记在工作区，你的改动也仍保留在 stash 中。\n" +
              "请在工作区解决冲突后提交；确认无误后可清理该 stash。",
          );
        }
      }
    },
  );
  // 组合操作：放弃本地修改 -> pull（用于解决拉取冲突）
  ipcMain.handle(
    "remote:pullWithDiscard",
    async (
      _event,
      repoPath: string,
      remote?: string,
      branch?: string,
    ): Promise<void> => {
      const git = getGit(repoPath);
      const { remote: r, branch: b } = await resolveRemoteBranch(
        repoPath,
        remote,
        branch,
      );
      const statusBeforePull = await git.status();
      const currentBranch = statusBeforePull.current;
      await git.raw(["reset", "--hard", "HEAD"]);
      await git.pull(r, b);
      if (currentBranch && !statusBeforePull.tracking) {
        try {
          await git.branch(["--set-upstream-to", `${r}/${b}`, currentBranch]);
          console.log(`已建立跟踪关系: ${currentBranch} -> ${r}/${b}`);
        } catch (err) {
          console.error("建立跟踪关系失败:", err);
        }
      }
    },
  );
}