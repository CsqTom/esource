import simpleGit, { SimpleGit } from "simple-git";
import fs from "fs";
import path from "path";
import os from "os";

export function getGit(repoPath: string): SimpleGit {
  return simpleGit(repoPath).env('GIT_TERMINAL_PROMPT', '0');
}

/** 将用户名密码嵌入到远程 URL 中 */
export function embedCredentialsInUrl(url: string, username: string, password: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = encodeURIComponent(username);
    parsed.password = encodeURIComponent(password);
    return parsed.toString();
  } catch {
    // URL 解析失败时回退：手动插入凭据
    const match = url.match(/^(https?:\/\/)(.*)$/);
    if (match) {
      const protocol = match[1];
      const rest = match[2];
      return `${protocol}${encodeURIComponent(username)}:${encodeURIComponent(password)}@${rest}`;
    }
    return url;
  }
}

/** 从 URL 中提取主机名（用于匹配远程） */
export function extractHostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** 从 URL 中移除凭据（用于显示） */
export function stripCredentialsFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
      return parsed.toString().replace(/\/\/@/, '//');
    }
    return url;
  } catch {
    return url;
  }
}

export function serializeStatus(summary: any): SerializedStatus {
  return {
    current: summary.current || "",
    tracking: summary.tracking || "",
    files: (summary.files || []).map((f: any) => ({
      path: f.path,
      index: f.index || " ",
      working_dir: f.working_dir || " ",
    })),
    ahead: summary.ahead || 0,
    behind: summary.behind || 0,
    isClean: summary.isClean?.() ?? true,
    conflicted: (summary.conflicted || []).map((f: any) =>
      typeof f === "string" ? f : f.path || "",
    ),
    created: (summary.created || []).map((f: any) =>
      typeof f === "string" ? f : f.path || "",
    ),
    deleted: (summary.deleted || []).map((f: any) =>
      typeof f === "string" ? f : f.path || "",
    ),
    modified: (summary.modified || []).map((f: any) =>
      typeof f === "string" ? f : f.path || "",
    ),
    renamed: (summary.renamed || []).map((f: any) => ({
      from: f.from || f.path || "",
      to: f.to || f.path || "",
    })),
    staged: (summary.staged || []).map((f: any) =>
      typeof f === "string" ? f : f.path || "",
    ),
    not_added: (summary.not_added || []).map((f: any) =>
      typeof f === "string" ? f : f.path || "",
    ),
  };
}

/** 从跟踪分支自动解析 remote 名和分支名 */
export async function resolveRemoteBranch(
  repoPath: string,
  remote?: string,
  branch?: string,
): Promise<{ remote: string; branch: string }> {
  if (remote && branch) return { remote, branch };
  const status = await getGit(repoPath).status();
  const tracking = status.tracking || "";
  return {
    remote: remote || (tracking ? tracking.split("/")[0] : "origin"),
    branch: branch || status.current || "HEAD",
  };
}

// ── Diff 解析工具 ──

export interface HunkData {
  header: string;
  lines: string[];
}

export function parseHunks(diff: string): HunkData[] {
  const hunks: HunkData[] = [];
  let current: HunkData | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) {
      if (current) hunks.push(current);
      current = { header: line, lines: [] };
    } else if (
      current &&
      (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))
    ) {
      current.lines.push(line);
    }
  }
  if (current) hunks.push(current);
  return hunks;
}

export function buildPatch(file: string, hunk: HunkData): string {
  return `--- a/${file}\n+++ b/${file}\n${hunk.header}\n${hunk.lines.join("\n")}\n`;
}

export function reverseHunk(hunk: HunkData): HunkData {
  const lines = hunk.lines.map((l) => {
    if (l.startsWith("+")) return "-" + l.slice(1);
    if (l.startsWith("-")) return "+" + l.slice(1);
    return l;
  });
  const header = hunk.header.replace(
    /@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/,
    (_m, oS, oC, nS, nC) => `@@ -${nS},${nC || 1} +${oS},${oC || 1} @@`,
  );
  return { header, lines };
}

export function parseLogOutput(output: string): SerializedCommit[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\x1f");
      return {
        hash: parts[0] || "",
        parents: parts[1] ? parts[1].split(" ").filter(Boolean) : [],
        author: parts[2] || "",
        authorEmail: parts[3] || "",
        date: new Date(parts[4] || "").getTime(),
        message: parts[5] || "",
        body: "",
        refs: parts[6] ? parts[6].split(", ").filter(Boolean) : [],
      };
    });
}

export function parseDiff(diffStr: string, filePath: string): SerializedDiff {
  let oldLineNo = 0,
    newLineNo = 0;
  const hunks: SerializedHunk[] = [];
  let current: SerializedHunk | null = null;
  for (const line of diffStr.split("\n")) {
    const h = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
    if (h) {
      if (current) hunks.push(current);
      oldLineNo = parseInt(h[1], 10);
      newLineNo = parseInt(h[3], 10);
      current = {
        header: line,
        oldStart: oldLineNo,
        oldLines: parseInt(h[2] || "1", 10),
        newStart: newLineNo,
        newLines: parseInt(h[4] || "1", 10),
        lines: [],
      };
    } else if (current) {
      const type = line.startsWith("+")
        ? "added"
        : line.startsWith("-")
          ? "removed"
          : "context";
      current.lines.push({
        type,
        content: line,
        oldLineNo: type === "added" ? undefined : oldLineNo++,
        newLineNo: type === "removed" ? undefined : newLineNo++,
      });
      if (type === "added") newLineNo++;
      else if (type === "removed") oldLineNo++;
      else {
        oldLineNo++;
        newLineNo++;
      }
    }
  }
  if (current) hunks.push(current);
  return {
    file: filePath,
    hunks,
    added: hunks.reduce(
      (s, h) => s + h.lines.filter((l) => l.type === "added").length,
      0,
    ),
    removed: hunks.reduce(
      (s, h) => s + h.lines.filter((l) => l.type === "removed").length,
      0,
    ),
  };
}

export async function applyPatchFromFile(
  git: SimpleGit,
  patch: string,
  options: string[],
): Promise<void> {
  const tmpDir = path.join(
    os.tmpdir(),
    "esource-patch-" +
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2, 6),
  );
  const patchFile = path.join(tmpDir, "patch.diff");
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(patchFile, patch, "utf-8");
    await git.raw(["apply", "--unidiff-zero", ...options, patchFile]);
  } finally {
    try {
      if (fs.existsSync(tmpDir))
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

export function buildPartialPatch(
  file: string,
  diffText: string,
  selections: SelectionRange[],
): string {
  if (!selections.length) return "";
  const hunks: { header: string; content: string[] }[] = [];
  let current: { header: string; content: string[] } | null = null;
  for (const line of diffText.split("\n")) {
    if (line.startsWith("@@")) {
      current = { header: line, content: [] };
      hunks.push(current);
    } else if (
      current &&
      (line.startsWith("+") ||
        line.startsWith("-") ||
        line.startsWith(" ") ||
        line === "")
    ) {
      current.content.push(line === "" ? " " : line);
    }
  }
  const patchLines: string[] = [`--- a/${file}`, `+++ b/${file}`];
  for (const sel of selections) {
    if (sel.hunkIndex >= hunks.length) continue;
    const hunk = hunks[sel.hunkIndex];
    const m = hunk.header.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
    if (!m) continue;
    const rawOldStart = parseInt(m[1], 10),
      rawNewStart = parseInt(m[3], 10);
    const startIdx = Math.max(0, sel.startLine);
    const endIdx = Math.min(hunk.content.length - 1, sel.endLine);
    if (startIdx > endIdx) continue;
    const subLines = hunk.content.slice(startIdx, endIdx + 1);
    if (!subLines.some((l) => l.startsWith("+") || l.startsWith("-"))) continue;
    let oldOff = 0,
      newOff = 0;
    for (let i = 0; i < startIdx; i++) {
      const l = hunk.content[i];
      if (l.startsWith(" ") || l.startsWith("-")) oldOff++;
      if (l.startsWith(" ") || l.startsWith("+")) newOff++;
    }
    let oldCnt = 0,
      newCnt = 0;
    for (const l of subLines) {
      if (l.startsWith(" ") || l.startsWith("-")) oldCnt++;
      if (l.startsWith(" ") || l.startsWith("+")) newCnt++;
    }
    patchLines.push(
      `@@ -${rawOldStart + oldOff},${oldCnt} +${rawNewStart + newOff},${newCnt} @@`,
    );
    patchLines.push(...subLines);
  }
  // 没有产生任何 hunk（如选中的全是上下文行）时返回空串，避免生成无效补丁
  if (patchLines.length <= 2) return "";
  return patchLines.join("\n") + "\n";
}
// ── 冲突解决工具 ──

export type GitConflictOperation = "merge" | "rebase" | "cherry-pick" | null;

/** 通过 .git 目录中的状态文件判断进行中的合并/变基/cherry-pick 操作 */
export function detectGitOperation(repoPath: string): GitConflictOperation {
  const dotGit = path.join(repoPath, ".git");
  // rebase 进行中：.git/rebase-merge 或 rebase-apply 目录存在
  if (fs.existsSync(path.join(dotGit, "rebase-merge")) || fs.existsSync(path.join(dotGit, "rebase-apply"))) {
    return "rebase";
  }
  if (fs.existsSync(path.join(dotGit, "CHERRY_PICK_HEAD"))) return "cherry-pick";
  if (fs.existsSync(path.join(dotGit, "MERGE_HEAD"))) return "merge";
  return null;
}

/** 读取合并来源（MERGE_MSG 首行引号内的分支名，如 origin/master） */
export function readMergeSource(repoPath: string): string {
  try {
    const msg = fs
      .readFileSync(path.join(repoPath, ".git", "MERGE_MSG"), "utf-8")
      .split("\n")[0]
      .trim();
    const quoted = msg.match(/'([^']+)'/);
    return quoted ? quoted[1] : msg;
  } catch {
    return "";
  }
}

export interface ConflictSegmentData {
  type: "normal" | "conflict";
  /** normal 段的原始行 */
  lines?: string[];
  /** conflict 段我方（当前分支）行 */
  ours?: string[];
  /** conflict 段对方（传入分支）行 */
  theirs?: string[];
  /** conflict 段共同祖先行（diff3 风格才有） */
  base?: string[];
  /** 冲突标记上的两侧标签，如 HEAD / origin/master */
  oursLabel?: string;
  theirsLabel?: string;
  /** conflict 段原始行（解决其它块时原样保留用） */
  raw?: string[];
}

/** 解析工作区文件中的 <<<<<<< ======= >>>>>>> 冲突标记（兼容 diff3 风格的 ||||||| 段） */
export function parseConflictSegments(
  content: string,
): { hasMarkers: boolean; segments: ConflictSegmentData[] } {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(eol);
  const segments: ConflictSegmentData[] = [];
  let normal: string[] = [];
  let hasMarkers = false;

  const isStart = (l: string) => /^<{7}($|\s)/.test(l);
  const isBase = (l: string) => /^\|{7}($|\s)/.test(l);
  const isMid = (l: string) => /^={7}\s*$/.test(l);
  const isEnd = (l: string) => /^>{7}($|\s)/.test(l);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isStart(line)) {
      hasMarkers = true;
      const startIdx = i;
      const oursLabel = line.replace(/^<{7}\s*/, "").trim();
      i++;
      const ours: string[] = [];
      let base: string[] | undefined;
      const theirs: string[] = [];
      while (i < lines.length && !isBase(lines[i]) && !isMid(lines[i])) {
        ours.push(lines[i]);
        i++;
      }
      if (i < lines.length && isBase(lines[i])) {
        base = [];
        i++;
        while (i < lines.length && !isMid(lines[i])) {
          base.push(lines[i]);
          i++;
        }
      }
      i++; // 跳过 =======
      while (i < lines.length && !isEnd(lines[i])) {
        theirs.push(lines[i]);
        i++;
      }
      const theirsLabel = i < lines.length ? lines[i].replace(/^>{7}\s*/, "").trim() : "";
      if (i < lines.length) i++; // 跳过 >>>>>>>
      if (normal.length) {
        segments.push({ type: "normal", lines: normal });
        normal = [];
      }
      segments.push({
        type: "conflict",
        ours,
        theirs,
        base,
        oursLabel,
        theirsLabel,
        raw: lines.slice(startIdx, i),
      });
    } else {
      normal.push(line);
      i++;
    }
  }
  if (normal.length) segments.push({ type: "normal", lines: normal });
  return { hasMarkers, segments };
}

/** 将 buildPartialPatch 生成的局部补丁整体反转（交换 +/- 与 hunk 头的新旧行号） */
export function reversePatch(patchText: string): string {
  const lines = patchText.split("\n");
  const out: string[] = [];
  let i = 0;
  // 文件头（---/+++ 行）
  while (i < lines.length && !lines[i].startsWith("@@")) {
    if (lines[i]) out.push(lines[i]);
    i++;
  }
  while (i < lines.length) {
    if (!lines[i].startsWith("@@")) {
      i++;
      continue;
    }
    const header = lines[i];
    const content: string[] = [];
    i++;
    while (i < lines.length && !lines[i].startsWith("@@") && lines[i] !== "") {
      content.push(lines[i]);
      i++;
    }
    const reversed = reverseHunk({ header, lines: content });
    out.push(reversed.header, ...reversed.lines);
  }
  return out.join("\n") + "\n";
}
