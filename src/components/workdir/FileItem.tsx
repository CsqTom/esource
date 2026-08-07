import { useState, useRef, useEffect } from 'react';
import { FileChangeItem } from '../../types';
import { Plus, Undo2, RotateCcw, File, FilePlus, FileMinus, AlertTriangle, ExternalLink, FolderOpen, Trash2, Copy, Terminal, Ban } from 'lucide-react';
import { GitignoreDialog } from './GitignoreDialog';

interface FileItemProps {
  file: FileChangeItem;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onStage: () => void;
  onUnstage: () => void;
  onDiscard: () => void;
  repoPath: string;
  onRefreshStatus?: () => void;
}

const statusConfig = {
  added: { icon: FilePlus, color: 'text-green-400', label: '新增' },
  modified: { icon: File, color: 'text-blue-400', label: '修改' },
  deleted: { icon: FileMinus, color: 'text-red-400', label: '删除' },
  renamed: { icon: File, color: 'text-purple-400', label: '重命名' },
  conflicted: { icon: AlertTriangle, color: 'text-yellow-400', label: '冲突' },
  untracked: { icon: FilePlus, color: 'text-gray-400', label: '未跟踪' },
};

/** 文件是否被 git 跟踪（未跟踪文件和新增文件视为未跟踪） */
function isTracked(file: FileChangeItem): boolean {
  return file.status !== 'untracked' && file.status !== 'added';
}

export function FileItem({
  file,
  isSelected,
  onClick,
  onStage,
  onUnstage,
  onDiscard,
  repoPath,
  onRefreshStatus,
}: FileItemProps) {
  const config = statusConfig[file.status];
  const Icon = config.icon;
  const tracked = isTracked(file);
  const isUntracked = file.status === 'untracked';

  // 右键菜单状态
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Gitignore 对话框状态
  const [showGitignoreDialog, setShowGitignoreDialog] = useState(false);

  // 用 ref 保存最新值，避免闭包过期
  const fileRef = useRef(file);
  fileRef.current = file;
  const repoPathRef = useRef(repoPath);
  repoPathRef.current = repoPath;

  // 点击菜单外部关闭
  useEffect(() => {
    if (!menuPos) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuPos(null);
      }
    };
    const handleScroll = () => setMenuPos(null);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [menuPos]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  const closeMenu = () => setMenuPos(null);

  const handleOpen = async () => {
    closeMenu();
    const fp = fileRef.current.path;
    const rp = repoPathRef.current;
    try {
      await window.electronAPI.shell.openPath(rp + '/' + fp);
    } catch (err: any) {
      console.error('打开文件失败:', err?.message || err);
    }
  };

  const handleShowInFolder = () => {
    closeMenu();
    const fp = fileRef.current.path;
    const rp = repoPathRef.current;
    // 使用 shell.openPath 打开父目录（跨平台兼容性更好）
    const dirPath = fp.includes('/') ? fp.substring(0, fp.lastIndexOf('/')) : '.';
    window.electronAPI.shell.openPath(rp + '/' + dirPath)
      .catch((err) => console.error('打开文件夹失败:', err?.message || err));
  };

  const handleRemoveFile = async () => {
    closeMenu();
    const fp = fileRef.current.path;
    const rp = repoPathRef.current;
    if (!confirm(`确定要删除文件 "${fp}" 吗？\n此操作不可撤销。`)) return;
    try {
      await window.electronAPI.file.remove(rp, fp);
    } catch (err: any) {
      console.error('删除文件失败:', err?.message || err);
    }
  };

  const handleRestore = () => {
    closeMenu();
    const fp = fileRef.current.path;
    if (!isTracked(fileRef.current)) return;
    if (!confirm(`确定要恢复文件 "${fp}" 的修改吗？`)) return;
    onDiscard();
  };

  /** 获取文件所在目录的绝对路径（统一正斜杠） */
  const getDirPath = (): string => {
    const fp = fileRef.current.path;
    const rp = repoPathRef.current;
    const dirPath = fp.includes('/') ? fp.substring(0, fp.lastIndexOf('/')) : '.';
    return rp.replace(/\\/g, '/') + '/' + dirPath;
  };

  const handleCopyPathBackslash = () => {
    closeMenu();
    const fp = fileRef.current.path;
    const rp = repoPathRef.current;
    // rp 已经是反斜杠（Windows），fp 是正斜杠 → 统一转反斜杠
    const winPath = rp + '\\' + fp.replace(/\//g, '\\');
    navigator.clipboard.writeText(winPath).catch(console.error);
  };

  const handleCopyPathForwardSlash = () => {
    closeMenu();
    const fp = fileRef.current.path;
    const rp = repoPathRef.current;
    // rp 是反斜杠（Windows）→ 转正斜杠，fp 已经是正斜杠
    const unixPath = rp.replace(/\\/g, '/') + '/' + fp;
    navigator.clipboard.writeText(unixPath).catch(console.error);
  };

  const handleOpenTerminal = () => {
    closeMenu();
    const dirPath = getDirPath();
    window.electronAPI.shell.openTerminal(dirPath)
      .catch((err) => console.error('打开终端失败:', err?.message || err));
  };

  const handleGitignore = () => {
    closeMenu();
    setShowGitignoreDialog(true);
  };

  const handleGitignoreConfirm = async (rules: string[]) => {
    setShowGitignoreDialog(false);
    try {
      await window.electronAPI.workdir.addToGitignore(repoPathRef.current, rules);
      // 刷新状态
      if (onRefreshStatus) onRefreshStatus();
    } catch (err: any) {
      console.error('添加忽略规则失败:', err?.message || err);
    }
  };

  return (
    <>
      <div
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={`group flex items-center gap-2 px-3 py-0.5 cursor-pointer transition-colors ${
          isSelected
            ? 'selected-file'
            : 'hover:bg-gray-800'
        }`}
      >
        {/* 复选框（暂存/取消暂存） */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            file.staged ? onUnstage() : onStage();
          }}
          className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            file.staged
              ? 'bg-blue-500 border-blue-500'
              : 'border-gray-600 hover:border-gray-400'
          }`}
          title={file.staged ? '取消暂存' : '暂存'}
        >
          {file.staged && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* 文件图标 */}
        <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />

        {/* 文件路径 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm truncate">{file.path}</span>
            {file.oldPath && (
              <span className="text-xs text-gray-500 truncate">← {file.oldPath}</span>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {file.staged ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnstage();
              }}
              className="p-1 hover:bg-orange-900/30 rounded text-orange-400"
              title="取消暂存"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          ) : file.status !== 'untracked' && file.status !== 'added' ? (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStage();
                }}
                className="p-1 hover:bg-green-900/30 rounded text-green-400"
                title="暂存"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDiscard();
                }}
                className="p-1 hover:bg-red-900/30 rounded text-red-400"
                title="恢复（丢弃变更）"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStage();
              }}
              className="p-1 hover:bg-green-900/30 rounded text-green-400"
              title="暂存"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 状态标签 */}
        <span className={`text-xs ${config.color} flex-shrink-0`}>
          {config.label}
        </span>
      </div>

      {/* 右键菜单 */}
      {menuPos && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: menuPos.x,
            top: menuPos.y,
            zIndex: 9999,
          }}
          className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[180px]"
        >
          <button
            onClick={handleOpen}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors text-left"
          >
            <ExternalLink className="w-4 h-4 text-blue-400" />
            打开
          </button>
          <button
            onClick={handleShowInFolder}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors text-left"
          >
            <FolderOpen className="w-4 h-4 text-yellow-400" />
            在资源管理器打开
          </button>
          <button
            onClick={handleCopyPathBackslash}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors text-left"
          >
            <Copy className="w-4 h-4 text-gray-400" />
            复制路径(windows左斜杠)
          </button>
          <button
            onClick={handleCopyPathForwardSlash}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors text-left"
          >
            <Copy className="w-4 h-4 text-gray-400" />
            复制路径(linux 右斜杠)
          </button>
          <button
            onClick={handleOpenTerminal}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors text-left"
          >
            <Terminal className="w-4 h-4 text-green-400" />
            当前路径打开终端
          </button>
          {isUntracked && (
            <>
              <div className="border-t border-gray-700 my-1" />
              <button
                onClick={handleGitignore}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors text-left"
              >
                <Ban className="w-4 h-4 text-orange-400" />
                添加忽略
              </button>
            </>
          )}
          <div className="border-t border-gray-700 my-1" />
          <button
            onClick={handleRemoveFile}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors text-left"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
            移除
          </button>
          <button
            onClick={handleRestore}
            disabled={!tracked}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left ${
              tracked
                ? 'text-gray-200 hover:bg-gray-700'
                : 'text-gray-600 cursor-not-allowed'
            }`}
          >
            <RotateCcw className={`w-4 h-4 ${tracked ? 'text-green-400' : 'text-gray-600'}`} />
            恢复文件改动
          </button>
        </div>
      )}

      {showGitignoreDialog && (
        <GitignoreDialog
          repoPath={repoPathRef.current}
          filePath={fileRef.current.path}
          onClose={() => setShowGitignoreDialog(false)}
          onConfirm={handleGitignoreConfirm}
        />
      )}
    </>
  );
}