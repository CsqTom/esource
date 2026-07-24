import { FileChangeItem } from '../../types';
import { Plus, Undo2, RotateCcw, File, FilePlus, FileMinus, AlertTriangle } from 'lucide-react';

interface FileItemProps {
  file: FileChangeItem;
  isSelected: boolean;
  onClick: () => void;
  onStage: () => void;
  onUnstage: () => void;
  onDiscard: () => void;
}

const statusConfig = {
  added: { icon: FilePlus, color: 'text-green-400', label: '新增' },
  modified: { icon: File, color: 'text-blue-400', label: '修改' },
  deleted: { icon: FileMinus, color: 'text-red-400', label: '删除' },
  renamed: { icon: File, color: 'text-purple-400', label: '重命名' },
  conflicted: { icon: AlertTriangle, color: 'text-yellow-400', label: '冲突' },
  untracked: { icon: FilePlus, color: 'text-gray-400', label: '未跟踪' },
};

export function FileItem({
  file,
  isSelected,
  onClick,
  onStage,
  onUnstage,
  onDiscard,
}: FileItemProps) {
  const config = statusConfig[file.status];
  const Icon = config.icon;

  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
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
  );
}