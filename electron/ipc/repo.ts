import { ipcMain, dialog } from 'electron';
import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface RepoRecord {
  id: string;
  name: string;
  path: string;
  addedAt: number;
}

// 简单的 JSON 文件存储（替代 electron-store，避免 ESM 兼容问题）
const STORE_PATH = path.join(
  process.env.APPDATA || path.join(os.homedir(), '.esource'),
  'repo-store.json'
);

function loadStore(): RepoRecord[] {
  try {
    if (fs.existsSync(STORE_PATH)) {
      return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveStore(records: RepoRecord[]): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(records, null, 2), 'utf-8');
}

function getGit(repoPath: string): SimpleGit {
  return simpleGit(repoPath);
}

/**
 * 序列化边界：将 simple-git 的 StatusSummary 转换为纯 JSON。
 * 所有 class 实例、不可枚举属性、Symbol 等不可序列化数据都被过滤掉。
 */
function serializeStatus(summary: any): SerializedStatus {
  return {
    current: summary.current || '',
    tracking: summary.tracking || '',
    files: (summary.files || []).map((f: any) => ({
      path: f.path,
      index: f.index || ' ',
      working_dir: f.working_dir || ' ',
    })),
    ahead: summary.ahead || 0,
    behind: summary.behind || 0,
    isClean: summary.isClean?.() ?? true,
    conflicted: (summary.conflicted || []).map((f: any) => (typeof f === 'string' ? f : f.path || '')),
    created: (summary.created || []).map((f: any) => (typeof f === 'string' ? f : f.path || '')),
    deleted: (summary.deleted || []).map((f: any) => (typeof f === 'string' ? f : f.path || '')),
    modified: (summary.modified || []).map((f: any) => (typeof f === 'string' ? f : f.path || '')),
    renamed: (summary.renamed || []).map((f: any) => ({
      from: f.from || f.path || '',
      to: f.to || f.path || '',
    })),
    staged: (summary.staged || []).map((f: any) => (typeof f === 'string' ? f : f.path || '')),
    not_added: (summary.not_added || []).map((f: any) => (typeof f === 'string' ? f : f.path || '')),
  };
}

export function registerRepoHandlers() {
  // ── 获取仓库列表 ──
  ipcMain.handle('repo:list', async (): Promise<SerializedRepository[]> => {
    const records = loadStore();
    const repos: SerializedRepository[] = [];

    for (const record of records) {
      try {
        if (!fs.existsSync(path.join(record.path, '.git'))) {
          continue;
        }
        const git = getGit(record.path);
        const status = await git.status();
        const branchSummary = await git.branch();
        const remotes = await git.getRemotes(true);

        repos.push({
          id: record.id,
          name: record.name,
          path: record.path,
          currentBranch: status.current || 'HEAD',
          isClean: (status.isClean?.() ?? true) && !status.conflicted?.length,
          ahead: status.ahead || 0,
          behind: status.behind || 0,
          remoteUrl: remotes[0]?.refs?.fetch || '',
          addedAt: record.addedAt,
        });
      } catch {
        repos.push({
          id: record.id,
          name: record.name,
          path: record.path,
          currentBranch: 'unknown',
          isClean: true,
          ahead: 0,
          behind: 0,
          remoteUrl: '',
          addedAt: record.addedAt,
        });
      }
    }
    return repos;
  });

  // ── 添加已有仓库 ──
  ipcMain.handle('repo:add', async (): Promise<SerializedRepository> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择 Git 仓库目录',
    });

    if (result.canceled || !result.filePaths.length) {
      throw new Error('用户取消了选择');
    }

    const repoPath = result.filePaths[0];
    if (!fs.existsSync(path.join(repoPath, '.git'))) {
      throw new Error('所选目录不是一个 Git 仓库（没有 .git 目录）');
    }

    const records = loadStore();
    const existing = records.find((r) => r.path === repoPath);
    if (existing) {
      throw new Error('该仓库已经在列表中');
    }

    const record: RepoRecord = {
      id: `repo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: path.basename(repoPath),
      path: repoPath,
      addedAt: Date.now(),
    };

    records.push(record);
    saveStore( records);

    const git = getGit(repoPath);
    const status = await git.status();

    return {
      id: record.id,
      name: record.name,
      path: record.path,
      currentBranch: status.current || 'HEAD',
      isClean: (status.isClean?.() ?? true) && !status.conflicted?.length,
      ahead: status.ahead || 0,
      behind: status.behind || 0,
      remoteUrl: '',
      addedAt: record.addedAt,
    };
  });

  // ── 移除仓库 ──
  ipcMain.handle('repo:remove', async (_event, id: string): Promise<void> => {
    const records = loadStore();
    saveStore( records.filter((r) => r.id !== id));
  });

  // ── 克隆远程仓库 ──
  ipcMain.handle('repo:clone', async (_event, url: string, destPath: string): Promise<SerializedRepository> => {
    if (!url || !destPath) {
      throw new Error('请提供仓库 URL 和本地路径');
    }

    fs.mkdirSync(destPath, { recursive: true });
    const git = simpleGit();
    await git.clone(url, destPath);

    const record: RepoRecord = {
      id: `repo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: path.basename(destPath),
      path: destPath,
      addedAt: Date.now(),
    };

    const records = loadStore();
    records.push(record);
    saveStore( records);

    const repoGit = getGit(destPath);
    const status = await repoGit.status();

    return {
      id: record.id,
      name: record.name,
      path: record.path,
      currentBranch: status.current || 'HEAD',
      isClean: (status.isClean?.() ?? true) && !status.conflicted?.length,
      ahead: status.ahead || 0,
      behind: status.behind || 0,
      remoteUrl: url,
      addedAt: record.addedAt,
    };
  });

  // ── 初始化新仓库 ──
  ipcMain.handle('repo:init', async (): Promise<SerializedRepository> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择要初始化 Git 仓库的目录',
    });

    if (result.canceled || !result.filePaths.length) {
      throw new Error('用户取消了选择');
    }

    const repoPath = result.filePaths[0];
    const git = getGit(repoPath);
    await git.init();

    const record: RepoRecord = {
      id: `repo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: path.basename(repoPath),
      path: repoPath,
      addedAt: Date.now(),
    };

    const records = loadStore();
    records.push(record);
    saveStore( records);

    return {
      id: record.id,
      name: record.name,
      path: record.path,
      currentBranch: 'master',
      isClean: true,
      ahead: 0,
      behind: 0,
      remoteUrl: '',
      addedAt: record.addedAt,
    };
  });

  // ── 工作区状态 ──
  ipcMain.handle('workdir:status', async (_event, repoPath: string): Promise<SerializedStatus> => {
    const git = getGit(repoPath);
    const status = await git.status();
    return serializeStatus(status);
  });

  // ── 暂存文件 ──
  ipcMain.handle('workdir:stage', async (_event, repoPath: string, files: string[]): Promise<void> => {
    const git = getGit(repoPath);
    await git.add(files);
  });

  // ── 取消暂存 ──
  ipcMain.handle('workdir:unstage', async (_event, repoPath: string, files: string[]): Promise<void> => {
    const git = getGit(repoPath);
    await git.reset(['--', ...files]);
  });

  // ── 恢复文件（丢弃工作区变更） ──
  ipcMain.handle('workdir:discard', async (_event, repoPath: string, files: string[]): Promise<void> => {
    const git = getGit(repoPath);
    await git.checkout(['--', ...files]);
  });

  // ── 暂存所有 ──
  ipcMain.handle('workdir:stageAll', async (_event, repoPath: string): Promise<void> => {
    const git = getGit(repoPath);
    await git.add('.');
  });

  // ── 取消暂存所有 ──
  ipcMain.handle('workdir:unstageAll', async (_event, repoPath: string): Promise<void> => {
    const git = getGit(repoPath);
    await git.reset(['--', '.']);
  });

  // ── 暂存指定块 ──
  ipcMain.handle('workdir:stageHunk', async (_event, repoPath: string, file: string, hunkIndex: number): Promise<void> => {
    const git = getGit(repoPath);
    // 获取工作区 diff
    const diff = await git.diff(['--unified=999999', file]);
    const hunks = parseHunks(diff);
    if (hunks.length <= hunkIndex) {
      throw new Error(`Hunk index ${hunkIndex} out of range`);
    }
    // 构建 patch 内容：只包含目标块，应用到暂存区
    const targetHunk = hunks[hunkIndex];
    const patch = buildPatch(file, targetHunk);
    // 使用 --cached 应用到暂存区
    await git.applyPatch(patch, ['--cached']);
  });

  // ── 取消暂存指定块 ──
  ipcMain.handle('workdir:unstageHunk', async (_event, repoPath: string, file: string, hunkIndex: number): Promise<void> => {
    const git = getGit(repoPath);
    // 获取暂存区 diff
    const diff = await git.diff(['--cached', '--unified=999999', file]);
    const hunks = parseHunks(diff);
    if (hunks.length <= hunkIndex) {
      throw new Error(`Hunk index ${hunkIndex} out of range`);
    }
    const targetHunk = hunks[hunkIndex];
    // 反转块内容（取消暂存 = 反向应用 patch 到暂存区）
    const reversedHunk = reverseHunk(targetHunk);
    const patch = buildPatch(file, reversedHunk);
    await git.applyPatch(patch, ['--cached']);
  });

  // ── 获取文件 Diff ──
  ipcMain.handle('workdir:diff', async (_event, repoPath: string, file: string, staged: boolean = false): Promise<SerializedDiff> => {
    const git = getGit(repoPath);
    const args = staged ? ['--cached', file] : [file];
    const diffStr = await git.diff(args);
    return parseDiff(diffStr, file);
  });

  // ── 提交 ──
  ipcMain.handle('workdir:commit', async (_event, repoPath: string, message: string): Promise<void> => {
    if (!message?.trim()) {
      throw new Error('提交信息不能为空');
    }
    const git = getGit(repoPath);
    await git.commit(message);
  });

  // ── 分支列表 ──
  ipcMain.handle('branch:list', async (_event, repoPath: string): Promise<SerializedBranch[]> => {
    const git = getGit(repoPath);
    // 获取本地分支
    const localBranchSummary = await git.branch();
    // 获取远程分支
    const remoteBranchSummary = await git.branch(['-r']);

    const branches: SerializedBranch[] = [];

    for (const [name, info] of Object.entries(localBranchSummary.branches)) {
      branches.push({
        name,
        current: info.current,
        commit: info.commit,
        label: info.label,
        remote: false,
      });
    }

    for (const [name, info] of Object.entries(remoteBranchSummary.branches)) {
      if (!branches.find((b) => b.name === name)) {
        branches.push({
          name,
          current: false,
          commit: info.commit,
          label: info.label,
          remote: true,
        });
      }
    }

    return branches;
  });

  // ── 切换分支 ──
  ipcMain.handle('branch:checkout', async (_event, repoPath: string, branchName: string): Promise<void> => {
    const git = getGit(repoPath);
    await git.checkout(branchName);
  });

  // ── 创建分支 ──
  ipcMain.handle('branch:create', async (_event, repoPath: string, name: string, base?: string): Promise<void> => {
    const git = getGit(repoPath);
    await git.branch([name, base || 'HEAD']);
  });

  // ── 删除分支 ──
  ipcMain.handle('branch:delete', async (_event, repoPath: string, name: string): Promise<void> => {
    const git = getGit(repoPath);
    await git.branch(['-D', name]);
  });

  // ── 合并分支 ──
  ipcMain.handle('branch:merge', async (_event, repoPath: string, branch: string): Promise<string> => {
    const git = getGit(repoPath);
    const result = await git.merge([branch]);
    // 序列化：只返回字符串结果
    return result?.result || '合并成功';
  });

  // ── 远程仓库列表 ──
  ipcMain.handle('remote:list', async (_event, repoPath: string): Promise<SerializedRemote[]> => {
    const git = getGit(repoPath);
    const remotes = await git.getRemotes(true);
    return remotes.map((r) => ({
      name: r.name,
      refs: {
        fetch: r.refs?.fetch || '',
        push: r.refs?.push || '',
      },
    }));
  });

  // ── 推送 ──
  ipcMain.handle('remote:push', async (_event, repoPath: string, remote?: string, branch?: string): Promise<void> => {
    const git = getGit(repoPath);
    await git.push(remote || 'origin', branch || 'HEAD');
  });

  // ── 拉取 ──
  ipcMain.handle('remote:pull', async (_event, repoPath: string, remote?: string, branch?: string): Promise<void> => {
    const git = getGit(repoPath);
    await git.pull(remote || 'origin', branch || 'HEAD');
  });

  // ── 获取 ──
  ipcMain.handle('remote:fetch', async (_event, repoPath: string, remote?: string): Promise<void> => {
    const git = getGit(repoPath);
    await git.fetch(remote || 'origin');
  });

  // ── 提交历史 ──
  ipcMain.handle('log:list', async (_event, repoPath: string, options?: LogQueryOptions): Promise<SerializedCommit[]> => {
    const git = getGit(repoPath);
    const logOptions: string[] = [];
    logOptions.push(`--max-count=${options?.maxCount || 50}`);
    if (options?.branch) {
      logOptions.push(options.branch);
    }
    logOptions.push('--format=%H|%an|%ae|%aI|%s|%b|%D');

    const result = await git.raw(['log', ...logOptions]);
    return parseLogOutput(result);
  });
}

// ── 辅助函数 ──

interface HunkData {
  header: string;
  lines: string[];
}

function parseHunks(diff: string): HunkData[] {
  const hunks: HunkData[] = [];
  const lines = diff.split('\n');
  let currentHunk: HunkData | null = null;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = { header: line, lines: [] };
    } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      currentHunk.lines.push(line);
    }
  }
  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

function buildPatch(file: string, hunk: HunkData): string {
  const header = `--- a/${file}\n+++ b/${file}\n`;
  return header + hunk.header + '\n' + hunk.lines.join('\n') + '\n';
}

function reverseHunk(hunk: HunkData): HunkData {
  const reversedLines = hunk.lines.map((line) => {
    if (line.startsWith('+')) return '-' + line.slice(1);
    if (line.startsWith('-')) return '+' + line.slice(1);
    return line;
  });
  // 反转 header 中的行号
  const header = hunk.header.replace(
    /@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/,
    (_match, oldStart, oldCount, newStart, newCount) => {
      return `@@ -${newStart},${newCount || 1} +${oldStart},${oldCount || 1} @@`;
    }
  );
  return { header, lines: reversedLines };
}

function parseLogOutput(output: string): SerializedCommit[] {
  return output
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.split('|');
      return {
        hash: parts[0] || '',
        author: parts[1] || '',
        authorEmail: parts[2] || '',
        date: new Date(parts[3] || '').getTime(),
        message: parts[4] || '',
        body: parts[5] || '',
        refs: parts[6] ? parts[6].split(', ').filter(Boolean) : [],
      };
    });
}

function parseDiff(diffStr: string, filePath: string): SerializedDiff {
  const lines = diffStr.split('\n');
  const hunks: SerializedHunk[] = [];
  let currentHunk: SerializedHunk | null = null;
  let oldLineNo = 0;
  let newLineNo = 0;

  for (const line of lines) {
    const hunkHeader = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
    if (hunkHeader) {
      if (currentHunk) hunks.push(currentHunk);
      oldLineNo = parseInt(hunkHeader[1], 10);
      newLineNo = parseInt(hunkHeader[3], 10);
      currentHunk = {
        header: line,
        oldStart: oldLineNo,
        oldLines: parseInt(hunkHeader[2] || '1', 10),
        newStart: newLineNo,
        newLines: parseInt(hunkHeader[4] || '1', 10),
        lines: [],
      };
    } else if (currentHunk) {
      const type = line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : 'context';
      const entry: SerializedDiffLine = {
        type,
        content: line,
        oldLineNo: type === 'added' ? undefined : oldLineNo++,
        newLineNo: type === 'removed' ? undefined : newLineNo++,
      };
      if (type === 'added') newLineNo++;
      if (type === 'removed') oldLineNo++;
      if (type === 'context') { oldLineNo++; newLineNo++; }
      currentHunk.lines.push(entry);
    }
  }
  if (currentHunk) hunks.push(currentHunk);

  return {
    file: filePath,
    hunks,
    added: hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.type === 'added').length, 0),
    removed: hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.type === 'removed').length, 0),
  };
}