import { ipcMain } from "electron";
import { getGit } from "./utils";

export function registerBranchHandlers() {
  ipcMain.handle(
    "branch:list",
    async (_event, repoPath: string): Promise<SerializedBranch[]> => {
      const git = getGit(repoPath);
      const branches: SerializedBranch[] = [];

      // 批量获取所有分支的最后提交时间（本地 + 远程）
      const refDates = new Map<string, number>();
      try {
        const refOutput = await git.raw([
          "for-each-ref",
          "--format=%(refname:short)|%(committerdate:unix)",
          "refs/heads/",
          "refs/remotes/",
        ]);
        for (const line of refOutput.split("\n").filter(Boolean)) {
          const [ref, unix] = line.split("|");
          if (ref && unix) refDates.set(ref, parseInt(unix, 10) * 1000);
        }
      } catch {}

      // 获取本地分支详细信息（包含跟踪关系和 ahead/behind）
      const localBranchesOutput = await git.raw(["branch", "-vv"]);
      const localBranchLines = localBranchesOutput.split("\n").filter(Boolean);

      for (const line of localBranchLines) {
        // 解析格式：* master      a1b2c3d [esource/master: ahead 2] Commit message
        const match = line.match(
          /^(\*?)\s+(\S+)\s+([a-f0-9]+)\s+(?:\[([^\]]+)\])?\s*(.*)$/,
        );
        if (!match) continue;

        const [, currentMark, name, commit, trackingInfo, label] = match;
        const isCurrent = currentMark === "*";

        // 解析跟踪信息：'esource/master: ahead 2, behind 1'
        let tracking: string | undefined;
        let ahead: number | undefined;
        let behind: number | undefined;

        if (trackingInfo) {
          const trackingMatch = trackingInfo.match(/^([^:]+)/);
          if (trackingMatch) {
            tracking = trackingMatch[1].trim();
          }

          const aheadMatch = trackingInfo.match(/ahead\s+(\d+)/);
          const behindMatch = trackingInfo.match(/behind\s+(\d+)/);
          if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
          if (behindMatch) behind = parseInt(behindMatch[1], 10);
        }

        branches.push({
          name,
          current: isCurrent,
          commit,
          label: label || name,
          remote: false,
          tracking,
          ahead,
          behind,
          date: refDates.get(name),
        });
      }

      // 获取远程分支
      const remote = await git.branch(["-r"]);
      for (const [name, info] of Object.entries(remote.branches)) {
        if (!branches.find((b) => b.name === name)) {
          branches.push({
            name,
            current: false,
            commit: info.commit,
            label: info.label,
            remote: true,
            date: refDates.get(name),
          });
        }
      }

      return branches;
    },
  );
  ipcMain.handle(
    "branch:checkout",
    async (_event, repoPath: string, branchName: string): Promise<void> => {
      await getGit(repoPath).checkout(branchName);
    },
  );
  ipcMain.handle(
    "branch:checkoutRemote",
    async (
      _event,
      repoPath: string,
      remoteBranchName: string,
    ): Promise<{ localName: string; created: boolean }> => {
      const git = getGit(repoPath);
      const parts = remoteBranchName.split("/");
      const remote = parts[0];
      const localName = parts.slice(1).join("/");

      const localBranches = await git.branch(["-vv"]);
      const existingBranch = localBranches.all.find((b) => b === localName);

      if (existingBranch) {
        await git.checkout(localName);
        return { localName, created: false };
      }

      await git.raw([
        "checkout",
        "-b",
        localName,
        "--track",
        `${remote}/${localName}`,
      ]);
      return { localName, created: true };
    },
  );
  /** 暂存 → 检出 → 恢复（用于解决工作区不干净时的检出冲突） */
  ipcMain.handle(
    "branch:checkoutWithStash",
    async (
      _event,
      repoPath: string,
      branchName: string,
      remoteBranchName?: string,
    ): Promise<void> => {
      const git = getGit(repoPath);
      await git.raw([
        "stash",
        "push",
        "-m",
        `Auto-stash before checkout to ${remoteBranchName || branchName}`,
      ]);
      try {
        if (remoteBranchName) {
          const parts = remoteBranchName.split("/");
          const remote = parts[0];
          const localName = parts.slice(1).join("/");
          await git.raw([
            "checkout",
            "-b",
            localName,
            "--track",
            `${remote}/${localName}`,
          ]);
        } else {
          await git.checkout(branchName);
        }
        try {
          await git.raw(["stash", "pop"]);
        } catch (popErr) {
          console.error("Stash pop 失败，冲突可能需要手动解决:", popErr);
        }
      } catch (checkoutErr) {
        try {
          await git.raw(["stash", "pop"]);
        } catch {}
        throw checkoutErr;
      }
    },
  );
  /** 放弃本地修改 → 检出（用于解决工作区不干净时的检出冲突） */
  ipcMain.handle(
    "branch:checkoutWithDiscard",
    async (
      _event,
      repoPath: string,
      branchName: string,
      remoteBranchName?: string,
    ): Promise<void> => {
      const git = getGit(repoPath);
      await git.raw(["reset", "--hard", "HEAD"]);
      if (remoteBranchName) {
        const parts = remoteBranchName.split("/");
        const remote = parts[0];
        const localName = parts.slice(1).join("/");
        await git.raw([
          "checkout",
          "-b",
          localName,
          "--track",
          `${remote}/${localName}`,
        ]);
      } else {
        await git.checkout(branchName);
      }
    },
  );
  ipcMain.handle(
    "branch:create",
    async (
      _event,
      repoPath: string,
      name: string,
      base?: string,
    ): Promise<void> => {
      await getGit(repoPath).branch([name, base || "HEAD"]);
    },
  );
  ipcMain.handle(
    "branch:delete",
    async (_event, repoPath: string, name: string): Promise<void> => {
      await getGit(repoPath).branch(["-D", name]);
    },
  );
  ipcMain.handle(
    "branch:merge",
    async (_event, repoPath: string, branch: string): Promise<string> => {
      return (await getGit(repoPath).merge([branch]))?.result || "合并成功";
    },
  );
}