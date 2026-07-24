# SourceTree 功能分析报告

## 一、概述

SourceTree 是 Atlassian 开发的免费 Git 图形化客户端，支持 Windows 和 macOS。
本站应用旨在复现其核心功能，使用 **Electron + TanStack Query + React** 技术栈。

## 二、功能模块总览

### P0 - 核心高频功能（必须优先实现）

| 编号 | 功能 | 说明 | 复杂度 |
|------|------|------|--------|
| P0-1 | **多仓库管理（Table）** | 以表格形式展示所有本地 Git 仓库：名称、路径、当前分支、状态（clean/dirty）、远程状态（ahead/behind） | ⭐⭐ |
| P0-2 | **Clone 远程仓库** | 输入 Git URL 和本地路径，克隆到本地并自动加入仓库列表 | ⭐⭐ |
| P0-3 | **Add/Init 本地仓库** | 添加已存在的本地 Git 仓库，或在目录初始化新仓库 | ⭐ |
| P0-4 | **分支切换** | 切换到指定分支（checkout）；支持本地/远程分支选择 | ⭐⭐ |
| P0-5 | **变更文件列表** | 展示工作区变更文件（已修改/已暂存/新增/删除/冲突），支持文件筛选 | ⭐⭐ |
| P0-6 | **文件暂存/取消暂存/恢复** | 对单个文件或全目录进行 `git add` / `git reset` / `git checkout -- <file>` | ⭐⭐ |
| P0-7 | **文件变更内容对比（Diff）** | 显示文件的具体变更内容（行级 diff），语法高亮 | ⭐⭐⭐ |
| P0-8 | **块暂存（Hunk Staging）** | 针对 diff 中的某个代码块单独暂存/取消暂存 | ⭐⭐⭐ |
| P0-9 | **提交（Commit）** | 填写提交信息，选择暂存区文件进行提交 | ⭐⭐ |
| P0-10 | **推送/拉取/获取（Push/Pull/Fetch）** | 与远程仓库同步 | ⭐⭐ |

### P1 - 重要功能（第二阶段实现）

| 编号 | 功能 | 说明 | 复杂度 |
|------|------|------|--------|
| P1-1 | **提交历史（Log）** | 展示提交历史，支持分支图可视化 | ⭐⭐⭐ |
| P1-2 | **创建/删除分支** | 基于当前 HEAD 或指定 commit 创建分支，删除分支 | ⭐⭐ |
| P1-3 | **合并（Merge）** | 选择分支合并到当前分支 | ⭐⭐ |
| P1-4 | **标签管理** | 创建/删除标签 | ⭐ |
| P1-5 | **Stash 暂存** | 暂存工作区变更，恢复暂存 | ⭐⭐ |
| P1-6 | **远程仓库管理** | 添加/删除/修改远程仓库地址 | ⭐ |
| P1-7 | **文件状态颜色标识** | 新增(绿色)、修改(蓝色)、删除(红色)、冲突(黄色) | ⭐ |
| P1-8 | **子模块管理** | 子模块添加、更新 | ⭐⭐ |

### P2 - 进阶功能（第三阶段实现）

| 编号 | 功能 | 说明 | 复杂度 |
|------|------|------|--------|
| P2-1 | **交互式 Rebase** | 通过 UI 进行 rebase 操作 | ⭐⭐⭐⭐ |
| P2-2 | **Cherry Pick** | 选择特定 commit 应用到当前分支 | ⭐⭐ |
| P2-3 | **文件 Blame/Annotate** | 逐行显示文件最后修改者和提交 | ⭐⭐⭐ |
| P2-4 | **Patch 管理** | 创建/应用 patch 文件 | ⭐⭐ |
| P2-5 | **Git Flow** | 支持 Git Flow 工作流（feature/release/hotfix） | ⭐⭐⭐ |
| P2-6 | **搜索/过滤 Log** | 按作者、关键词、日期过滤提交历史 | ⭐⭐ |
| P2-7 | **冲突解决** | 可视化冲突标记和解决 | ⭐⭐⭐⭐ |
| P2-8 | **仓库设置** | 编辑 .git/config、gitignore 等 | ⭐⭐ |
| P2-9 | **SSH 密钥管理** | SSH 密钥生成和配置 | ⭐⭐ |

## 三、技术架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron App                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Main Process                            │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │ Git Service  │  │ Repo Manager │  │ IPC Handlers    │  │  │
│  │  │ (simple-git) │  │ (store)      │  │ (ipcMain.handle)│  │  │
│  │  └─────────────┘  └──────────────┘  └─────────────────┘  │  │
│  │                        │                                    │  │
│  │  ┌─────────────────────┴────────────────────────────────┐  │  │
│  │  │              Serialization Boundary                   │  │  │
│  │  │  Git 对象 → 纯 JSON 数据（可序列化）                    │  │  │
│  │  └─────────────────────┬────────────────────────────────┘  │  │
│  │                        │ IPC (contextBridge)                │  │
│  └────────────────────────┼───────────────────────────────────┘  │
│                           │                                       │
│  ┌────────────────────────┼───────────────────────────────────┐  │
│  │              Renderer Process (React)                      │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │              TanStack Query Layer                     │  │  │
│  │  │  ┌────────────┐ ┌───────────┐ ┌──────────────────┐  │  │  │
│  │  │  │ QueryCache │ │ Mutation  │ │ select 转换层    │  │  │  │
│  │  │  │ (gcTime)   │ │           │ │ (Date/Map 还原)  │  │  │  │
│  │  │  └────────────┘ └───────────┘ └──────────────────┘  │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │                React UI Components                    │  │  │
│  │  │  ┌──────────┐ ┌───────┐ ┌──────┐ ┌──────────────┐  │  │  │
│  │  │  │ RepoList │ │Diff  │ │Branch│ │CommitPanel   │  │  │  │
│  │  │  │ (Table)  │ │Viewer│ │Panel │ │              │  │  │  │
│  │  │  └──────────┘ └───────┘ └──────┘ └──────────────┘  │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 序列化边界设计

**核心原则：IPC 是消息传递，不是内存共享**

```
主进程（Node.js 环境）
  │
  │  Git 操作返回的对象（如 StatusSummary, DiffResult, LogResult）
  │  包含 class 实例、Map、Symbol、不可枚举属性等不可序列化数据
  │
  ▼
  【序列化层】── 在主进程中将所有数据转换为纯 JSON
  │  - Buffer → { type: 'Buffer', data: [...] } 或 Base64
  │  - Date → timestamp (number)
  │  - Map/Set → Array
  │  - Class 实例 → 普通对象（取值忽略 prototype）
  │  - 删除循环引用
  │
  ▼
  IPC 传输（Structured Clone Algorithm）
  │
  ▼
  【select 转换层】── 在 TanStack Query 的 select 中还原
  │  - timestamp → new Date()
  │  - 特殊格式还原为业务对象
  │
  ▼
  React 组件消费
```

### 3.3 缓存策略

| 数据类型 | staleTime | gcTime | 说明 |
|---------|-----------|--------|------|
| 仓库列表 | 5s | 5min | 用户可能从外部变更 |
| 当前分支状态 | 3s | 5min | 频繁变化的实时数据 |
| 文件变更列表 | 2s | 2min | 需要高频刷新 |
| Diff 内容 | 30s | 5min | 计算成本高，缓存稍久 |
| 提交历史 | 10s | 5min | 中等频率变化 |
| 大文件内容 | 不缓存 | 0（组件卸载即清理） | 防止内存泄漏 |

### 3.4 技术栈选择

| 层 | 技术 | 说明 |
|----|------|------|
| 桌面框架 | Electron 28+ | 跨平台桌面应用 |
| 前端框架 | React 18+ | UI 组件 |
| 构建工具 | Vite | 快速开发/构建 |
| 状态管理 | TanStack Query v5 | 服务端状态缓存 |
| 路由 | TanStack Router | 文件路由 |
| 样式 | Tailwind CSS | 原子化 CSS |
| Git 操作 | simple-git | Node.js Git 封装 |
| Diff | diff | 行级差异计算 |
| 语法高亮 | Prism.js / shiki | 代码高亮 |
| 图标 | Lucide React | 图标库 |

## 四、数据模型设计

### 4.1 Repository（仓库）

```typescript
interface Repository {
  id: string;           // 唯一 ID
  name: string;         // 仓库名称（目录名）
  path: string;         // 本地绝对路径
  currentBranch: string;
  status: 'clean' | 'dirty';
  ahead: number;        // 领先远程提交数
  behind: number;       // 落后远程提交数
  lastFetchAt: number;  // 最后获取时间戳
  remoteUrl?: string;
  addedAt: number;      // 添加到管理的时间戳
}
```

### 4.2 FileChange（文件变更）

```typescript
interface FileChange {
  path: string;             // 相对仓库根目录的路径
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'conflicted' | 'untracked';
  staged: boolean;
  oldPath?: string;         // 重命名时原路径
  hunks: Hunk[];            // 变更块
  binary: boolean;
}
```

### 4.3 Hunk（变更块）

```typescript
interface Hunk {
  header: string;           // @@ -1,3 +1,4 @@
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
  staged: boolean;          // 是否已暂存此块
}

interface DiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}
```

### 4.4 Commit（提交）

```typescript
interface Commit {
  hash: string;
  author: string;
  authorEmail: string;
  date: number;             // timestamp
  message: string;
  body?: string;
  refs: string[];           // 分支/标签引用
  parents: string[];
}
```

## 五、IPC 接口设计

### 5.1 仓库管理

```typescript
// 主进程暴露的 API
interface ElectronAPI {
  // 仓库管理
  repo: {
    list(): Promise<SerializedRepository[]>;
    add(path: string): Promise<SerializedRepository>;
    remove(id: string): Promise<void>;
    clone(url: string, path: string): Promise<SerializedRepository>;
    init(path: string): Promise<SerializedRepository>;
  };

  // 分支操作
  branch: {
    list(repoPath: string): Promise<SerializedBranch[]>;
    checkout(repoPath: string, branch: string): Promise<void>;
    create(repoPath: string, name: string, base?: string): Promise<void>;
    delete(repoPath: string, name: string): Promise<void>;
    merge(repoPath: string, branch: string): Promise<void>;
  };

  // 变更与提交
  workdir: {
    status(repoPath: string): Promise<SerializedStatus>;
    stage(repoPath: string, files: string[]): Promise<void>;
    unstage(repoPath: string, files: string[]): Promise<void>;
    discard(repoPath: string, files: string[]): Promise<void>;
    stageHunk(repoPath: string, file: string, hunkIndex: number): Promise<void>;
    unstageHunk(repoPath: string, file: string, hunkIndex: number): Promise<void>;
    diff(repoPath: string, file: string): Promise<SerializedDiff>;
    commit(repoPath: string, message: string): Promise<void>;
  };

  // 远程操作
  remote: {
    push(repoPath: string, remote?: string, branch?: string): Promise<void>;
    pull(repoPath: string, remote?: string, branch?: string): Promise<void>;
    fetch(repoPath: string, remote?: string): Promise<void>;
    list(repoPath: string): Promise<SerializedRemote[]>;
  };

  // 提交历史
  log: {
    list(repoPath: string, options?: LogOptions): Promise<SerializedCommit[]>;
  };
}
```

## 六、UI 布局设计

```
┌──────────────────────────────────────────────────────────────┐
│  Header: 仓库选择器 │ 当前分支 │ 操作按钮（Pull/Push/Fetch）│
├──────────┬───────────────────────────────────────────────────┤
│          │  ┌────────────────────────────────────────────┐  │
│  左侧    │  │  文件变更列表（工作区 vs 暂存区）           │  │
│  仓库    │  │  ┌───┐ ┌───┐ ┌───┐ ┌───┐                  │  │
│  列表    │  │  │全部│ │已暂│ │未暂│ │冲突│  Tab 切换      │  │
│  (Table) │  │  └───┘ └───┘ └───┘ └───┘                  │  │
│          │  │  ┌─ 文件 1 (modified) ─────────────────┐   │  │
│          │  │  │  □ 文件路径                         │   │  │
│          │  │  │  +1  -3  ╋ 暂存块  ⊕ 恢复          │   │  │
│          │  │  └─────────────────────────────────────┘   │  │
│          │  │  ┌─ 文件 2 (untracked) ───────────────┐   │  │
│          │  │  │  □ 文件路径                         │   │  │
│          │  │  │  +5  ╋ 暂存                         │   │  │
│          │  │  └─────────────────────────────────────┘   │  │
│          │  ├────────────────────────────────────────────┤  │
│          │  │  Diff 面板 / 提交信息面板                  │  │
│          │  │  ┌──────────────────────────────────────┐  │  │
│          │  │  │  提交信息输入框                       │  │  │
│          │  │  │  [提交]                              │  │  │
│          │  │  │  ── Diff 内容 ──                     │  │  │
│          │  │  │  @@ -1,7 +1,5 @@                    │  │  │
│          │  │  │  - 旧行                              │  │  │
│          │  │  │  + 新行                              │  │  │
│          │  │  │  █ 上下文行                          │  │  │
│          │  │  └──────────────────────────────────────┘  │  │
│          └────────────────────────────────────────────────┘  │
├──────────┴───────────────────────────────────────────────────┤
│  Status Bar: 仓库路径 | 当前分支 | 远程同步状态              │
└──────────────────────────────────────────────────────────────┘
```

## 七、阶段规划

### Phase 1：基础框架 + 仓库管理 + 文件变更查看
- [x] Electron + React + Vite 项目脚手架
- [x] TanStack Query 集成
- [x] 仓库列表管理（添加/删除/克隆）
- [x] 分支切换
- [x] 工作区状态查看（文件变更列表）
- [x] 文件暂存/取消暂存/恢复
- [x] Diff 查看（基础行级差异）

### Phase 2：提交 + 远程操作 + 分支管理
- [ ] Commit 提交
- [ ] Push/Pull/Fetch
- [ ] 分支创建/删除/合并
- [ ] 块暂存/取消暂存
- [ ] 提交历史查看

### Phase 3：进阶功能
- [ ] 交互式 Rebase
- [ ] Cherry Pick
- [ ] Stash
- [ ] 标签管理
- [ ] 冲突解决
- [ ] Blame
- [ ] 搜索/过滤