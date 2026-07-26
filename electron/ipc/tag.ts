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
            name,
          ]);
          const parts = detail.trim().split("|");
          tags.push({
            name,
            commit: parts[0] || "",
            label: name,
            date: new Date(parts[1] || "").getTime(),
            annotated: false,
            message: parts[2] || "",
          });
        } catch {
          tags.push({
            name,
            commit: "",
            label: name,
            date: 0,
            annotated: false,
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