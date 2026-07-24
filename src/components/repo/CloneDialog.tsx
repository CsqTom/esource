import { useState } from 'react';
import { X, Download, FolderOpen } from 'lucide-react';

interface CloneDialogProps {
  onClose: () => void;
  onClone: (url: string, destPath: string) => Promise<void>;
}

export function CloneDialog({ onClose, onClone }: CloneDialogProps) {
  const [url, setUrl] = useState('');
  const [destPath, setDestPath] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClone = async () => {
    if (!url.trim() || !destPath.trim()) {
      setError('请填写仓库 URL 和目标路径');
      return;
    }

    if (!url.includes('://') && !url.includes('@')) {
      setError('请输入有效的 Git 仓库 URL');
      return;
    }

    setIsCloning(true);
    setError(null);

    try {
      await onClone(url.trim(), destPath.trim());
      onClose();
    } catch (err: any) {
      setError(err?.message || '克隆失败，请检查 URL 和路径');
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-[480px] fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Download className="w-5 h-5 text-green-400" />
            克隆仓库
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              远程仓库 URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git 或 git@github.com:user/repo.git"
              className="w-full bg-gray-700 text-gray-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              目标路径
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={destPath}
                onChange={(e) => setDestPath(e.target.value)}
                placeholder="C:\projects\my-repo"
                className="flex-1 bg-gray-700 text-gray-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              />
              <button
                onClick={async () => {
                  // 在 Electron 中可通过 dialog.showOpenDialog 选择目录
                  // 简单填入手动路径
                }}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                title="选择目录"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/50 text-red-300 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleClone}
              disabled={isCloning}
              className="flex items-center gap-1 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
            >
              {isCloning ? (
                <>
                  <span className="animate-spin">◌</span>
                  克隆中...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  克隆
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}