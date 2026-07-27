import path from "path";
import fs from "fs";

/** 获取 .gitignore 文件的完整路径 */
export function getGitignorePath(repoPath: string): string {
  return path.join(repoPath, ".gitignore");
}

/** 确保 .gitignore 存在，返回当前内容（若不存在则创建空文件） */
export function ensureGitignore(repoPath: string): string {
  const gitignorePath = getGitignorePath(repoPath);
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, "", "utf-8");
    return "";
  }
  return fs.readFileSync(gitignorePath, "utf-8");
}