import { ipcMain, dialog } from 'electron'; import simpleGit, { SimpleGit } from 'simple-git'; import fs from 'fs'; import path from 'path'; import os from 'os';
interface RepoRecord { id: string; name: string; path: string; addedAt: number; }
const STORE_PATH = path.join(process.env.APPDATA || path.join(os.homedir(), '.esource'), 'repo-store.json');
function loadStore(): RepoRecord[] { try { if (fs.existsSync(STORE_PATH)) return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')); } catch {} return []; }
function saveStore(records: RepoRecord[]): void { const dir = path.dirname(STORE_PATH); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(STORE_PATH, JSON.stringify(records, null, 2), 'utf-8'); }
function getGit(repoPath: string): SimpleGit { return simpleGit(repoPath); }
function serializeStatus(summary: any): SerializedStatus {
  return { current: summary.current || '', tracking: summary.tracking || '', files: (summary.files || []).map((f: any) => ({ path: f.path, index: f.index || ' ', working_dir: f.working_dir || ' ' })), ahead: summary.ahead || 0, behind: summary.behind || 0, isClean: summary.isClean?.() ?? true, conflicted: (summary.conflicted || []).map((f: any) => (typeof f === 'string' ? f : f.path || '')), created: (summary.created || []).map((f: any) => (typeof f === 'string' ? f : f.path || '')), deleted: (summary.deleted || []).map((f: any) => (typeof f === 'string' ? f : f.path || '')), modified: (summary.modified || []).map((f: any) => (typeof f === 'string' ? f : f.path || '')), renamed: (summary.renamed || []).map((f: any) => ({ from: f.from || f.path || '', to: f.to || f.path || '' })), staged: (summary.staged || []).map((f: any) => (typeof f === 'string' ? f : f.path || '')), not_added: (summary.not_added || []).map((f: any) => (typeof f === 'string' ? f : f.path || '')), };
}
export function registerRepoHandlers() {
  ipcMain.handle('repo:list', async (): Promise<SerializedRepository[]> => { const records = loadStore(); const repos: SerializedRepository[] = []; for (const record of records) { try { if (!fs.existsSync(path.join(record.path, '.git'))) continue; const git = getGit(record.path); const status = await git.status(); const remotes = await git.getRemotes(true); repos.push({ id: record.id, name: record.name, path: record.path, currentBranch: status.current || 'HEAD', isClean: (status.isClean?.() ?? true) && !status.conflicted?.length, ahead: status.ahead || 0, behind: status.behind || 0, remoteUrl: remotes[0]?.refs?.fetch || '', addedAt: record.addedAt }); } catch { repos.push({ id: record.id, name: record.name, path: record.path, currentBranch: 'unknown', isClean: true, ahead: 0, behind: 0, remoteUrl: '', addedAt: record.addedAt }); } } return repos; });
  ipcMain.handle('repo:add', async (): Promise<SerializedRepository> => { const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择 Git 仓库目录' }); if (result.canceled || !result.filePaths.length) throw new Error('用户取消了选择'); const repoPath = result.filePaths[0]; if (!fs.existsSync(path.join(repoPath, '.git'))) throw new Error('所选目录不是一个 Git 仓库（没有 .git 目录）'); const records = loadStore(); if (records.find((r) => r.path === repoPath)) throw new Error('该仓库已经在列表中'); const record: RepoRecord = { id: `repo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: path.basename(repoPath), path: repoPath, addedAt: Date.now() }; records.push(record); saveStore(records); const git = getGit(repoPath); const status = await git.status(); return { id: record.id, name: record.name, path: record.path, currentBranch: status.current || 'HEAD', isClean: (status.isClean?.() ?? true) && !status.conflicted?.length, ahead: status.ahead || 0, behind: status.behind || 0, remoteUrl: '', addedAt: record.addedAt }; });
  ipcMain.handle('repo:remove', async (_event, id: string): Promise<void> => { const records = loadStore(); saveStore(records.filter((r) => r.id !== id)); });
  ipcMain.handle('repo:clone', async (_event, url: string, destPath: string): Promise<SerializedRepository> => { if (!url || !destPath) throw new Error('请提供仓库 URL 和本地路径'); fs.mkdirSync(destPath, { recursive: true }); const git = simpleGit(); await git.clone(url, destPath); const record: RepoRecord = { id: `repo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: path.basename(destPath), path: destPath, addedAt: Date.now() }; const records = loadStore(); records.push(record); saveStore(records); const repoGit = getGit(destPath); const status = await repoGit.status(); return { id: record.id, name: record.name, path: record.path, currentBranch: status.current || 'HEAD', isClean: (status.isClean?.() ?? true) && !status.conflicted?.length, ahead: status.ahead || 0, behind: status.behind || 0, remoteUrl: url, addedAt: record.addedAt }; });
  ipcMain.handle('repo:init', async (): Promise<SerializedRepository> => { const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择要初始化 Git 仓库的目录' }); if (result.canceled || !result.filePaths.length) throw new Error('用户取消了选择'); const repoPath = result.filePaths[0]; const git = getGit(repoPath); await git.init(); const record: RepoRecord = { id: `repo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: path.basename(repoPath), path: repoPath, addedAt: Date.now() }; const records = loadStore(); records.push(record); saveStore(records); return { id: record.id, name: record.name, path: record.path, currentBranch: 'master', isClean: true, ahead: 0, behind: 0, remoteUrl: '', addedAt: record.addedAt }; });
  ipcMain.handle('workdir:status', async (_event, repoPath: string): Promise<SerializedStatus> => { const git = getGit(repoPath); return serializeStatus(await git.status()); });
  ipcMain.handle('workdir:stage', async (_event, repoPath: string, files: string[]): Promise<void> => { await getGit(repoPath).add(files); });
  ipcMain.handle('workdir:unstage', async (_event, repoPath: string, files: string[]): Promise<void> => { await getGit(repoPath).reset(['--', ...files]); });
  ipcMain.handle('workdir:discard', async (_event, repoPath: string, files: string[]): Promise<void> => { await getGit(repoPath).checkout(['--', ...files]); });
  ipcMain.handle('workdir:stageAll', async (_event, repoPath: string): Promise<void> => { await getGit(repoPath).add('.'); });
  ipcMain.handle('workdir:unstageAll', async (_event, repoPath: string): Promise<void> => { await getGit(repoPath).reset(['--', '.']); });
  ipcMain.handle('workdir:stageHunk', async (_event, repoPath: string, file: string, hunkIndex: number): Promise<void> => { const git = getGit(repoPath); const diff = await git.diff(['--unified=999999', file]); const hunks = parseHunks(diff); if (hunks.length <= hunkIndex) throw new Error(`Hunk index ${hunkIndex} out of range`); await git.applyPatch(buildPatch(file, hunks[hunkIndex]), ['--cached']); });
  ipcMain.handle('workdir:unstageHunk', async (_event, repoPath: string, file: string, hunkIndex: number): Promise<void> => { const git = getGit(repoPath); const diff = await git.diff(['--cached', '--unified=999999', file]); const hunks = parseHunks(diff); if (hunks.length <= hunkIndex) throw new Error(`Hunk index ${hunkIndex} out of range`); await git.applyPatch(buildPatch(file, reverseHunk(hunks[hunkIndex])), ['--cached']); });
  ipcMain.handle('workdir:diff', async (_event, repoPath: string, file: string, staged: boolean = false): Promise<SerializedDiff> => { return parseDiff(await getGit(repoPath).diff(staged ? ['--cached', file] : [file]), file); });
  ipcMain.handle('workdir:readFile', async (_event, repoPath: string, file: string, asBase64: boolean = false): Promise<string> => { const fullPath = path.join(repoPath, file); if (!fs.existsSync(fullPath)) throw new Error('文件不存在: ' + file); if (asBase64) { return fs.readFileSync(fullPath).toString('base64'); } return fs.readFileSync(fullPath, 'utf-8'); });
  ipcMain.handle('workdir:stageLines', async (_event, repoPath: string, file: string, selections: SelectionRange[]): Promise<void> => { const git = getGit(repoPath); const diffStr = await git.diff([file]); const patch = buildPartialPatch(file, diffStr, selections); if (patch) await applyPatchFromFile(git, patch, ['--cached']); });
  ipcMain.handle('workdir:unstageLines', async (_event, repoPath: string, file: string, selections: SelectionRange[]): Promise<void> => { const git = getGit(repoPath); const diffStr = await git.diff(['--cached', '-R', file]); const patch = buildPartialPatch(file, diffStr, selections); if (patch) await applyPatchFromFile(git, patch, ['--cached']); });
  ipcMain.handle('workdir:discardLines', async (_event, repoPath: string, file: string, selections: SelectionRange[]): Promise<void> => { const git = getGit(repoPath); const diffStr = await git.diff(['-R', file]); const patch = buildPartialPatch(file, diffStr, selections); if (patch) await applyPatchFromFile(git, patch, []); });
  ipcMain.handle('workdir:commit', async (_event, repoPath: string, message: string): Promise<void> => { if (!message?.trim()) throw new Error('提交信息不能为空'); await getGit(repoPath).commit(message); });
  ipcMain.handle('branch:list', async (_event, repoPath: string): Promise<SerializedBranch[]> => {
    const git = getGit(repoPath);
    const branches: SerializedBranch[] = [];

    // 批量获取所有分支的最后提交时间（本地 + 远程）
    const refDates = new Map<string, number>();
    try {
      const refOutput = await git.raw(['for-each-ref', '--format=%(refname:short)|%(committerdate:unix)', 'refs/heads/', 'refs/remotes/']);
      for (const line of refOutput.split('\n').filter(Boolean)) {
        const [ref, unix] = line.split('|');
        if (ref && unix) refDates.set(ref, parseInt(unix, 10) * 1000);
      }
    } catch {}

    // 获取本地分支详细信息（包含跟踪关系和 ahead/behind）
    const localBranchesOutput = await git.raw(['branch', '-vv']);
    const localBranchLines = localBranchesOutput.split('\n').filter(Boolean);

    for (const line of localBranchLines) {
      // 解析格式：* master      a1b2c3d [esource/master: ahead 2] Commit message
      const match = line.match(/^(\*?)\s+(\S+)\s+([a-f0-9]+)\s+(?:\[([^\]]+)\])?\s*(.*)$/);
      if (!match) continue;

      const [, currentMark, name, commit, trackingInfo, label] = match;
      const isCurrent = currentMark === '*';

      // 解析跟踪信息：'esource/master: ahead 2, behind 1'
      let tracking: string | undefined;
      let ahead: number | undefined;
      let behind: number | undefined;

      if (trackingInfo) {
        // 提取跟踪的远程分支
        const trackingMatch = trackingInfo.match(/^([^:]+)/);
        if (trackingMatch) {
          tracking = trackingMatch[1].trim();
        }

        // 提取 ahead/behind 信息
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
    const remote = await git.branch(['-r']);
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
  });
  ipcMain.handle('branch:checkout', async (_event, repoPath: string, branchName: string): Promise<void> => { await getGit(repoPath).checkout(branchName); });
  ipcMain.handle('branch:checkoutRemote', async (_event, repoPath: string, remoteBranchName: string): Promise<{ localName: string; created: boolean }> => {
    const git = getGit(repoPath);
    // 解析远程分支名：'origin/feature' -> remote='origin', branch='feature'
    const parts = remoteBranchName.split('/');
    const remote = parts[0];
    const localName = parts.slice(1).join('/');

    // 检查本地分支是否已存在并跟踪该远程分支
    const localBranches = await git.branch(['-vv']);
    const existingBranch = localBranches.all.find((b) => b === localName);

    if (existingBranch) {
      // 本地分支已存在，直接切换（simple-git 的 checkout 会处理跟踪关系）
      await git.checkout(localName);
      return { localName, created: false };
    }

    // 本地分支不存在，创建并设置跟踪：git checkout -b <localName> --track <remote>/<branch>
    await git.raw(['checkout', '-b', localName, '--track', `${remote}/${localName}`]);
    return { localName, created: true };
  });
  /** 暂存 → 检出 → 恢复（用于解决工作区不干净时的检出冲突） */
  ipcMain.handle('branch:checkoutWithStash', async (_event, repoPath: string, branchName: string, remoteBranchName?: string): Promise<void> => {
    const git = getGit(repoPath);
    // 1. stash 本地修改
    await git.raw(['stash', 'push', '-m', `Auto-stash before checkout to ${remoteBranchName || branchName}`]);
    try {
      // 2. 检出（远程分支时创建跟踪分支，本地分支时直接切换）
      if (remoteBranchName) {
        const parts = remoteBranchName.split('/');
        const remote = parts[0];
        const localName = parts.slice(1).join('/');
        await git.raw(['checkout', '-b', localName, '--track', `${remote}/${localName}`]);
      } else {
        await git.checkout(branchName);
      }
      // 3. pop stash 恢复（如果失败则保留在 stash 列表中）
      try { await git.raw(['stash', 'pop']); } catch (popErr) {
        console.error('Stash pop 失败，冲突可能需要手动解决:', popErr);
      }
    } catch (checkoutErr) {
      // 检出失败时恢复 stash
      try { await git.raw(['stash', 'pop']); } catch {}
      throw checkoutErr;
    }
  });
  /** 放弃本地修改 → 检出（用于解决工作区不干净时的检出冲突） */
  ipcMain.handle('branch:checkoutWithDiscard', async (_event, repoPath: string, branchName: string, remoteBranchName?: string): Promise<void> => {
    const git = getGit(repoPath);
    // 1. reset --hard 放弃所有本地修改
    await git.raw(['reset', '--hard', 'HEAD']);
    // 2. 检出（远程分支时创建跟踪分支，本地分支时直接切换）
    if (remoteBranchName) {
      const parts = remoteBranchName.split('/');
      const remote = parts[0];
      const localName = parts.slice(1).join('/');
      await git.raw(['checkout', '-b', localName, '--track', `${remote}/${localName}`]);
    } else {
      await git.checkout(branchName);
    }
  });
  ipcMain.handle('branch:create', async (_event, repoPath: string, name: string, base?: string): Promise<void> => { await getGit(repoPath).branch([name, base || 'HEAD']); });
  ipcMain.handle('branch:delete', async (_event, repoPath: string, name: string): Promise<void> => { await getGit(repoPath).branch(['-D', name]); });
  ipcMain.handle('branch:merge', async (_event, repoPath: string, branch: string): Promise<string> => { return (await getGit(repoPath).merge([branch]))?.result || '合并成功'; });
  ipcMain.handle('remote:list', async (_event, repoPath: string): Promise<SerializedRemote[]> => { return (await getGit(repoPath).getRemotes(true)).map((r) => ({ name: r.name, refs: { fetch: r.refs?.fetch || '', push: r.refs?.push || '' } })); });
  // 从跟踪分支自动解析 remote 名和分支名，避免硬编码 'origin' 导致非默认 remote 仓库操作失败
  async function resolveRemoteBranch(repoPath: string, remote?: string, branch?: string): Promise<{ remote: string; branch: string }> {
    if (remote && branch) return { remote, branch };
    const status = await getGit(repoPath).status();
    const tracking = status.tracking || '';
    return {
      remote: remote || (tracking ? tracking.split('/')[0] : 'origin'),
      branch: branch || status.current || 'HEAD',
    };
  }
  ipcMain.handle('remote:push', async (_event, repoPath: string, remote?: string, branch?: string): Promise<void> => {
    const git = getGit(repoPath);
    const { remote: r, branch: b } = await resolveRemoteBranch(repoPath, remote, branch);
    // 推送并建立跟踪关系（-u 参数）
    await git.push(['-u', r, b]);
    console.log(`已推送并建立跟踪关系: ${b} -> ${r}/${b}`);
  });
  ipcMain.handle('remote:pull', async (_event, repoPath: string, remote?: string, branch?: string): Promise<void> => {
    const git = getGit(repoPath);
    const { remote: r, branch: b } = await resolveRemoteBranch(repoPath, remote, branch);
    // 拉取前获取当前分支名
    const status = await git.status();
    const currentBranch = status.current;
    // 执行拉取
    await git.pull(r, b);
    // 如果当前分支没有跟踪远程分支，自动建立跟踪关系
    if (currentBranch && !status.tracking) {
      try {
        await git.branch(['--set-upstream-to', `${r}/${b}`, currentBranch]);
        console.log(`已建立跟踪关系: ${currentBranch} -> ${r}/${b}`);
      } catch (err) {
        console.error('建立跟踪关系失败:', err);
        // 不抛出错误，拉取已成功，跟踪关系建立失败不影响主流程
      }
    }
  });
  ipcMain.handle('remote:fetch', async (_event, repoPath: string, remote?: string): Promise<void> => {
    const git = getGit(repoPath);
    if (remote) { await git.fetch(remote); return; }
    // 未指定 remote 时从跟踪分支解析
    const status = await git.status();
    const r = status.tracking ? status.tracking.split('/')[0] : 'origin';
    await git.fetch(r);
  });
  ipcMain.handle('remote:add', async (_event, repoPath: string, name: string, url: string): Promise<void> => { await getGit(repoPath).raw(['remote', 'add', name, url]); });
  ipcMain.handle('remote:remove', async (_event, repoPath: string, name: string): Promise<void> => { await getGit(repoPath).raw(['remote', 'remove', name]); });
  ipcMain.handle('remote:rename', async (_event, repoPath: string, oldName: string, newName: string): Promise<void> => { await getGit(repoPath).raw(['remote', 'rename', oldName, newName]); });
  ipcMain.handle('remote:setUrl', async (_event, repoPath: string, name: string, url: string, push?: boolean): Promise<void> => { await getGit(repoPath).raw(['remote', ...(push ? ['set-url', '--push', name, url] : ['set-url', name, url])]); });
  ipcMain.handle('log:list', async (_event, repoPath: string, options?: LogQueryOptions): Promise<SerializedCommit[]> => {
    const opts: string[] = [`--max-count=${options?.maxCount || 50}`]; if (options?.author) opts.push(`--author=${options.author}`); if (options?.since) opts.push(`--since=${options.since}`);
    // 当前分支视图排除远程跟踪分支；所有分支视图保留远程跟踪分支
    if (options?.all) opts.push("--decorate", "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D", "--date-order");
    else opts.push("--decorate", "--decorate-refs-exclude=refs/remotes/", "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D", "--date-order");
    // all=true 拉取所有分支历史（--all），否则按指定分支或当前 HEAD
    if (options?.all) opts.push("--all"); else if (options?.branch) opts.push(options.branch); else opts.push("HEAD");
    const raw = await getGit(repoPath).raw(['log', ...opts]);
    return parseLogOutput(raw);
  });
  ipcMain.handle('log:graphJson', async (_event, repoPath: string, maxCount: number = 200): Promise<any[]> => {
    const result = await getGit(repoPath).raw(['log', `--max-count=${maxCount}`, '--all', '--decorate', '--decorate-refs-exclude=refs/remotes/', '--format=%H|||%P|||%an|||%ae|||%aI|||%cn|||%ce|||%cI|||%s|||%D']);
    const commits: any[] = [];
    for (const line of result.split('\n').filter(Boolean)) {
      const parts = line.split('|||'); if (parts.length < 10) continue;
      commits.push({ hash: parts[0], parents: parts[1] ? parts[1].split(' ').filter(Boolean) : [], author: { name: parts[2], email: parts[3], timestamp: new Date(parts[4]).getTime() / 1000 }, committer: { name: parts[5], email: parts[6], timestamp: new Date(parts[7]).getTime() / 1000 }, message: parts[8], refs: (parts[9] || "").split(", ").filter(Boolean) });
    }
    return commits;
  });
  ipcMain.handle('log:raw', async (_event, repoPath: string, options?: LogQueryOptions): Promise<string> => { const opts: string[] = [`--max-count=${options?.maxCount || 100}`]; if (options?.branch) opts.push(options.branch); if (options?.author) opts.push(`--author=${options.author}`); if (options?.since) opts.push(`--since=${options.since}`); if (options?.search) opts.push(`--grep=${options.search}`); opts.push('--all', '--graph', '--decorate', '--oneline'); return await getGit(repoPath).raw(['log', ...opts]); });
  ipcMain.handle('log:detail', async (_event, repoPath: string, hash: string): Promise<SerializedCommitDetail> => { const git = getGit(repoPath); const result = await git.raw(['show', '--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1f%D", "--no-patch', hash]); const parts = result.split('\n').filter(Boolean)[0]?.split('\x1f') || []; const files = await git.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', hash]); const changedFiles = files.split('\n').filter(Boolean).map((line) => { const [status, ...pathParts] = line.trim().split('\t'); return { status: status || 'M', path: pathParts.join('/') || '' }; }); return { hash: parts[0] || '', author: parts[1] || '', authorEmail: parts[2] || '', date: new Date(parts[3] || '').getTime(), message: parts[4] || '', body: parts[5] || '', refs: parts[6] ? parts[6].split(', ').filter(Boolean) : [], changedFiles }; });
  ipcMain.handle('tag:list', async (_event, repoPath: string): Promise<SerializedTag[]> => { const git = getGit(repoPath); const result = await git.tags(); const tags: SerializedTag[] = []; for (const name of result.all) { try { const detail = await git.raw(['show', '--format=%H|%aI|%s', '--no-patch', '--no-notes', name]); const parts = detail.trim().split('|'); tags.push({ name, commit: parts[0] || '', label: name, date: new Date(parts[1] || '').getTime(), annotated: false, message: parts[2] || '' }); } catch { tags.push({ name, commit: '', label: name, date: 0, annotated: false }); } } return tags; });
  ipcMain.handle('tag:create', async (_event, repoPath: string, name: string, message?: string): Promise<void> => { const git = getGit(repoPath); if (message) await git.raw(['tag', '-a', name, '-m', message]); else await git.raw(['tag', name]); });
  ipcMain.handle('tag:delete', async (_event, repoPath: string, name: string): Promise<void> => { await getGit(repoPath).raw(['tag', '-d', name]); });
  ipcMain.handle('stash:list', async (_event, repoPath: string): Promise<SerializedStash[]> => { const result = await getGit(repoPath).raw(['stash', 'list', '--format=%gd|%gs|%ai']); if (!result.trim()) return []; return result.split('\n').filter(Boolean).map((line, i) => { const parts = line.split('|'); const match = parts[0]?.match(/stash@\{(\d+)\}/); return { id: parts[0] || '', index: match ? parseInt(match[1], 10) : i, message: parts[1] || '', branch: '', date: new Date(parts[2] || '').getTime() }; }); });
  ipcMain.handle('stash:save', async (_event, repoPath: string, message?: string): Promise<void> => { await getGit(repoPath).raw(['stash', ...(message ? ['push', '-m', message] : ['push'])]); });
  ipcMain.handle('stash:pop', async (_event, repoPath: string, index?: number): Promise<void> => { await getGit(repoPath).raw(['stash', ...(index !== undefined ? ['pop', `stash@{${index}}`] : ['pop'])]); });
  ipcMain.handle('stash:apply', async (_event, repoPath: string, index: number): Promise<void> => { await getGit(repoPath).raw(['stash', 'apply', `stash@{${index}}`]); });
  ipcMain.handle('stash:drop', async (_event, repoPath: string, index: number): Promise<void> => { await getGit(repoPath).raw(['stash', 'drop', `stash@{${index}}`]); });
  // 组合操作：stash -> pull -> pop（用于解决拉取冲突）
  ipcMain.handle('remote:pullWithStash', async (_event, repoPath: string, remote?: string, branch?: string): Promise<void> => {
    const git = getGit(repoPath);
    const { remote: r, branch: b } = await resolveRemoteBranch(repoPath, remote, branch);
    // 拉取前获取当前分支名和跟踪状态
    const statusBeforePull = await git.status();
    const currentBranch = statusBeforePull.current;
    // 1. stash 本地修改
    await git.raw(['stash', 'push', '-m', `Auto-stash before pull from ${r}/${b}`]);
    try {
      // 2. pull 远程更新
      await git.pull(r, b);
      // 3. 建立跟踪关系（如果当前分支没有跟踪远程分支）
      if (currentBranch && !statusBeforePull.tracking) {
        try {
          await git.branch(['--set-upstream-to', `${r}/${b}`, currentBranch]);
          console.log(`已建立跟踪关系: ${currentBranch} -> ${r}/${b}`);
        } catch (err) {
          console.error('建立跟踪关系失败:', err);
        }
      }
      // 4. pop stash 恢复本地修改（如果失败则不阻止，用户可手动处理）
      try {
        await git.raw(['stash', 'pop']);
      } catch (popErr) {
        console.error('Stash pop 失败，冲突可能需要手动解决:', popErr);
        // 不抛出错误，pull 已成功，用户可在 stash 列表中找到备份
      }
    } catch (pullErr) {
      // pull 失败时尝试恢复 stash
      try {
        await git.raw(['stash', 'pop']);
      } catch {}
      throw pullErr;
    }
  });
  // 组合操作：放弃本地修改 -> pull（用于解决拉取冲突）
  ipcMain.handle('remote:pullWithDiscard', async (_event, repoPath: string, remote?: string, branch?: string): Promise<void> => {
    const git = getGit(repoPath);
    const { remote: r, branch: b } = await resolveRemoteBranch(repoPath, remote, branch);
    // 拉取前获取当前分支名和跟踪状态
    const statusBeforePull = await git.status();
    const currentBranch = statusBeforePull.current;
    // 1. reset --hard 放弃所有本地修改
    await git.raw(['reset', '--hard', 'HEAD']);
    // 2. pull 远程更新
    await git.pull(r, b);
    // 3. 建立跟踪关系（如果当前分支没有跟踪远程分支）
    if (currentBranch && !statusBeforePull.tracking) {
      try {
        await git.branch(['--set-upstream-to', `${r}/${b}`, currentBranch]);
        console.log(`已建立跟踪关系: ${currentBranch} -> ${r}/${b}`);
      } catch (err) {
        console.error('建立跟踪关系失败:', err);
      }
    }
  });
}
interface HunkData { header: string; lines: string[]; }
function parseHunks(diff: string): HunkData[] { const hunks: HunkData[] = []; let current: HunkData | null = null; for (const line of diff.split('\n')) { if (line.startsWith('@@')) { if (current) hunks.push(current); current = { header: line, lines: [] }; } else if (current && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) { current.lines.push(line); } } if (current) hunks.push(current); return hunks; }
function buildPatch(file: string, hunk: HunkData): string { return `--- a/${file}\n+++ b/${file}\n${hunk.header}\n${hunk.lines.join('\n')}\n`; }
function reverseHunk(hunk: HunkData): HunkData { const lines = hunk.lines.map((l) => { if (l.startsWith('+')) return '-' + l.slice(1); if (l.startsWith('-')) return '+' + l.slice(1); return l; }); const header = hunk.header.replace(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/, (_m, oS, oC, nS, nC) => `@@ -${nS},${nC || 1} +${oS},${oC || 1} @@`); return { header, lines }; }
function parseLogOutput(output: string): SerializedCommit[] { return output.split('\n').filter(Boolean).map((line) => { const parts = line.split('\x1f'); return { hash: parts[0] || "", parents: parts[1] ? parts[1].split(" ").filter(Boolean) : [], author: parts[2] || "", authorEmail: parts[3] || "", date: new Date(parts[4] || "").getTime(), message: parts[5] || "", body: "", refs: parts[6] ? parts[6].split(", ").filter(Boolean) : [] }; }); }
function parseDiff(diffStr: string, filePath: string): SerializedDiff { let oldLineNo = 0, newLineNo = 0; const hunks: SerializedHunk[] = []; let current: SerializedHunk | null = null; for (const line of diffStr.split('\n')) { const h = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/); if (h) { if (current) hunks.push(current); oldLineNo = parseInt(h[1], 10); newLineNo = parseInt(h[3], 10); current = { header: line, oldStart: oldLineNo, oldLines: parseInt(h[2] || '1', 10), newStart: newLineNo, newLines: parseInt(h[4] || '1', 10), lines: [] }; } else if (current) { const type = line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : 'context'; current.lines.push({ type, content: line, oldLineNo: type === 'added' ? undefined : oldLineNo++, newLineNo: type === 'removed' ? undefined : newLineNo++ }); if (type === 'added') newLineNo++; else if (type === 'removed') oldLineNo++; else { oldLineNo++; newLineNo++; } } } if (current) hunks.push(current); return { file: filePath, hunks, added: hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === 'added').length, 0), removed: hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === 'removed').length, 0) }; }
async function applyPatchFromFile(git: SimpleGit, patch: string, options: string[]): Promise<void> { const tmpDir = path.join(os.tmpdir(), 'esource-patch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)); const patchFile = path.join(tmpDir, 'patch.diff'); try { fs.mkdirSync(tmpDir, { recursive: true }); fs.writeFileSync(patchFile, patch, 'utf-8'); await git.raw(['apply', '--unidiff-zero', ...options, patchFile]); } finally { try { if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} } }
function buildPartialPatch(file: string, diffText: string, selections: SelectionRange[]): string { if (!selections.length) return ''; const hunks: { header: string; content: string[] }[] = []; let current: { header: string; content: string[] } | null = null; for (const line of diffText.split('\n')) { if (line.startsWith('@@')) { current = { header: line, content: [] }; hunks.push(current); } else if (current && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line === '')) { current.content.push(line === '' ? ' ' : line); } } const patchLines: string[] = [`--- a/${file}`, `+++ b/${file}`]; for (const sel of selections) { if (sel.hunkIndex >= hunks.length) continue; const hunk = hunks[sel.hunkIndex]; const m = hunk.header.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/); if (!m) continue; const rawOldStart = parseInt(m[1], 10), rawNewStart = parseInt(m[3], 10); const startIdx = Math.max(0, sel.startLine); const endIdx = Math.min(hunk.content.length - 1, sel.endLine); if (startIdx > endIdx) continue; const subLines = hunk.content.slice(startIdx, endIdx + 1); if (!subLines.some(l => l.startsWith('+') || l.startsWith('-'))) continue; let oldOff = 0, newOff = 0; for (let i = 0; i < startIdx; i++) { const l = hunk.content[i]; if (l.startsWith(' ') || l.startsWith('-')) oldOff++; if (l.startsWith(' ') || l.startsWith('+')) newOff++; } let oldCnt = 0, newCnt = 0; for (const l of subLines) { if (l.startsWith(' ') || l.startsWith('-')) oldCnt++; if (l.startsWith(' ') || l.startsWith('+')) newCnt++; } patchLines.push(`@@ -${rawOldStart + oldOff},${oldCnt} +${rawNewStart + newOff},${newCnt} @@`); patchLines.push(...subLines); } return patchLines.join('\n') + '\n'; }