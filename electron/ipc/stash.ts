import { ipcMain } from "electron";
import { getGit } from "./utils";

export function registerStashHandlers() {
  ipcMain.handle(
    "stash:list",
    async (_event, repoPath: string): Promise<SerializedStash[]> => {
      const result = await getGit(repoPath).raw([
        "stash",
        "list",
        "--format=%gd|%gs|%ai",
      ]);
      if (!result.trim()) return [];
      return result
        .split("\n")
        .filter(Boolean)
        .map((line, i) => {
          const parts = line.split("|");
          const match = parts[0]?.match(/stash@\{(\d+)\}/);
          return {
            id: parts[0] || "",
            index: match ? parseInt(match[1], 10) : i,
            message: parts[1] || "",
            branch: "",
            date: new Date(parts[2] || "").getTime(),
          };
        });
    },
  );
  ipcMain.handle(
    "stash:save",
    async (_event, repoPath: string, message?: string): Promise<void> => {
      await getGit(repoPath).raw([
        "stash",
        ...(message ? ["push", "-m", message] : ["push"]),
      ]);
    },
  );
  ipcMain.handle(
    "stash:pop",
    async (_event, repoPath: string, index?: number): Promise<void> => {
      await getGit(repoPath).raw([
        "stash",
        ...(index !== undefined ? ["pop", `stash@{${index}}`] : ["pop"]),
      ]);
    },
  );
  ipcMain.handle(
    "stash:apply",
    async (_event, repoPath: string, index: number): Promise<void> => {
      await getGit(repoPath).raw(["stash", "apply", `stash@{${index}}`]);
    },
  );
  ipcMain.handle(
    "stash:drop",
    async (_event, repoPath: string, index: number): Promise<void> => {
      await getGit(repoPath).raw(["stash", "drop", `stash@{${index}}`]);
    },
  );
}