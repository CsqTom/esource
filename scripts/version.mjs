#!/usr/bin/env node
// 从本地 git 生成版本信息，格式参考 monitor_backend/git_version.py：{标签}.{短hash}。
// 仅调用本机 git，不访问网络（软件面向局域网环境，版本必须在构建时固化）。
// vite.config 在 dev/build 启动时调用本脚本：
//   1. 写入 version.json（electron 主进程打包时读取）
//   2. 把合法 semver 版本写回 package.json（electron-builder 安装包元数据 / app.getVersion()）
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function git(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: root,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function getVersionInfo() {
  const shortHash = git("rev-parse --short=8 HEAD");
  const tag = git("describe --tags --abbrev=0");
  const describeLong = git("describe --tags --long"); // 如 v2026.9.7-1-gd7d3bd3
  const commitDate = git("log -1 --format=%cI");
  const branch = git("rev-parse --abbrev-ref HEAD");
  // 脏工作树判定：忽略未跟踪文件与构建生成物（package.json/version.json 由本脚本维护）
  const dirty = !!git(
    "status --porcelain -uno -- . ':(exclude)package.json' ':(exclude)version.json'",
  );
  const m = describeLong.match(/^(.*)-(\d+)-g([0-9a-f]+)$/);
  const ahead = m ? parseInt(m[2], 10) : 0;

  // 展示版本：{标签}.{短hash}，无标签时仅 hash；脏工作树追加 -dirty
  const display = `${tag || shortHash || "unknown"}${tag ? "." + shortHash : ""}${dirty ? "-dirty" : ""}`;
  // 安装包元数据版本（合法 semver）：tag 去掉 v 前缀，领先提交追加 -n.g<hash>，脏工作树追加 .dirty
  let version = (tag || "0.0.0").replace(/^v/, "");
  if (m) version = `${version}-${ahead}.g${m[3]}`;
  if (dirty) version += ".dirty";

  return { version, display, tag: tag || null, commitHash: shortHash, commitDate, branch, dirty };
}

export function writeVersionFiles() {
  const info = getVersionInfo();
  fs.writeFileSync(
    path.join(root, "version.json"),
    JSON.stringify({ ...info, builtAt: new Date().toISOString() }, null, 2) + "\n",
    "utf-8",
  );
  try {
    const pkgPath = path.join(root, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (pkg.version !== info.version) {
      pkg.version = info.version;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
    }
  } catch {
    // package.json 更新失败不阻断构建（安装包版本退化为原值）
  }
  return info;
}

// 直接执行（node scripts/version.mjs）时写入并打印
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  console.log(JSON.stringify(writeVersionFiles()));
}
