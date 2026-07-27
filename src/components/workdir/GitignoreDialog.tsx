import { useState, useEffect, useRef } from 'react';
import { X, File, FileType, Folder } from 'lucide-react';

type RuleType = 'file' | 'extension' | 'directory';

interface GitignoreDialogProps {
  repoPath: string;
  filePath: string;
  onClose: () => void;
  onConfirm: (rules: string[]) => void;
}

function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function getExtension(filePath: string): string {
  const name = getFileName(filePath);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

function generateRuleText(type: RuleType, filePath: string, dirPath?: string): string {
  switch (type) {
    case 'file': return filePath;
    case 'extension': {
      const ext = getExtension(filePath);
      return ext ? `*${ext}` : filePath;
    }
    case 'directory': return dirPath ? `${dirPath}/` : filePath.substring(0, filePath.lastIndexOf('/')) + '/';
  }
}

export function GitignoreDialog({
  repoPath,
  filePath,
  onClose,
  onConfirm,
}: GitignoreDialogProps) {
  const [ruleType, setRuleType] = useState<RuleType>('file');
  const [ruleText, setRuleText] = useState('');
  const [ancestorDirs, setAncestorDirs] = useState<string[]>([]);
  const [selectedDir, setSelectedDir] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.electronAPI.workdir.listAncestorDirs(repoPath, filePath)
      .then((dirs) => {
        setAncestorDirs(dirs);
        if (dirs.length > 0) setSelectedDir(dirs[0]);
      })
      .catch(console.error);
  }, [repoPath, filePath]);

  // 类型切换时更新规则文本
  useEffect(() => {
    setRuleText(generateRuleText(ruleType, filePath, selectedDir));
  }, [ruleType, selectedDir, filePath]);

  // 聚焦输入框
  useEffect(() => {
    if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [ruleText]);

  const handleConfirm = () => {
    if (!ruleText.trim()) return;
    onConfirm([ruleText.trim()]);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const confirmRef = useRef(handleConfirm);
  confirmRef.current = handleConfirm;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) confirmRef.current();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const fileExt = getExtension(filePath);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
    >
      <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-[420px] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-medium text-gray-100">添加忽略规则</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 规则输入框（第一行） */}
        <div className="px-4 pt-3 pb-2">
          <input
            ref={inputRef}
            type="text"
            value={ruleText}
            onChange={(e) => setRuleText(e.target.value)}
            className="w-full bg-gray-700 text-gray-100 text-sm font-mono rounded px-3 py-2 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            spellCheck={false}
          />
        </div>

        {/* 单选规则 */}
        <div className="px-4 pb-3 flex items-center gap-2">
          <label
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded cursor-pointer transition-colors text-xs ${
              ruleType === 'file' ? 'bg-blue-900/40 text-blue-300' : 'bg-gray-700/40 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <input type="radio" name="rt" checked={ruleType === 'file'} onChange={() => setRuleType('file')} className="sr-only" />
            <File className="w-3.5 h-3.5" />
            精确文件名
          </label>
          <label
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded cursor-pointer transition-colors text-xs ${
              ruleType === 'extension' ? 'bg-blue-900/40 text-blue-300' : 'bg-gray-700/40 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <input type="radio" name="rt" checked={ruleType === 'extension'} onChange={() => setRuleType('extension')} className="sr-only" />
            <FileType className="w-3.5 h-3.5" />
            {fileExt ? `*${fileExt}` : '(无扩展名)'}
          </label>
          <label
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded cursor-pointer transition-colors text-xs ${
              ruleType === 'directory' ? 'bg-blue-900/40 text-blue-300' : 'bg-gray-700/40 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <input type="radio" name="rt" checked={ruleType === 'directory'} onChange={() => setRuleType('directory')} className="sr-only" />
            <Folder className="w-3.5 h-3.5" />
            {ruleType === 'directory' ? (
              <select
                value={selectedDir}
                onChange={(e) => setSelectedDir(e.target.value)}
                className="bg-transparent text-blue-300 text-xs border-none outline-none cursor-pointer ml-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                {ancestorDirs.map((dir) => (
                  <option key={dir} value={dir} className="bg-gray-700 text-gray-200">
                    {dir === '.' ? '根目录' : dir}
                  </option>
                ))}
              </select>
            ) : (
              <span className="truncate max-w-[80px]">{ancestorDirs[0] || ''}/</span>
            )}
          </label>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors">
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!ruleText.trim()}
            className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-medium transition-colors"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}