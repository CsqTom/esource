import simpleGit, { SimpleGit } from "simple-git";
import fs from "fs";
import path from "path";
import os from "os";

export function getGit(repoPath: string): SimpleGit {
  return simpleGit(repoPath);
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
  return patchLines.join("\n") + "\n";
}