import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Tag, AlertCircle, Hash, Upload, Loader2 } from 'lucide-react';

interface CreateTagDialogProps {
  repoPath: string;
  /** 新标签指向的提交 */
  commitHash: string;
  /** 目标提交的说明（首行），仅用于展示 */
  commitMessage?: string;
  /** 创建（含推送）成功后通知父组件展示提示 */
  onNotice?: (text: string) => void;
  onClose: () => void;
}

/** 提取 IPC 错误中的可读信息 */
function formatError(err: any, channel: string): string {
  return (
    String(err?.message || err || '').replace(
      new RegExp(`^Error: Error invoking remote method '${channel}': Error: `),
      '',
    ) || '操作失败'
  );
}

/** 在指定提交上创建标签的弹层（提交历史右键 → 新建标签） */
export function CreateTagDialog({ repoPath, commitHash, commitMessage, onNotice, onClose }: CreateTagDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [pushAfterCreate, setPushAfterCreate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 标签已创建但推送失败：保持弹窗打开，仅允许重试推送
  const [pushRetryError, setPushRetryError] = useState<string | null>(null);

  // Escape 关闭弹层（document 级监听，焦点不在输入框时也生效）
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const tagName = name.trim();

  const handleCreate = async () => {
    if (!tagName) {
      setError('标签名称不能为空');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await window.electronAPI.tag.create(repoPath, tagName, message.trim() || undefined, commitHash);
    } catch (err) {
      setError(formatError(err, 'tag:create'));
      setBusy(false);
      return;
    }
    // 标签徽章来自 log 的 refs 装饰，需一并刷新
    queryClient.invalidateQueries({ queryKey: ['tags', repoPath] });
    queryClient.invalidateQueries({ queryKey: ['log', repoPath] });
    if (!pushAfterCreate) {
      onClose();
      return;
    }
    try {
      await window.electronAPI.tag.push(repoPath, tagName);
      queryClient.invalidateQueries({ queryKey: ['tagRemoteTags', repoPath] });
      onNotice?.(`标签 "${tagName}" 已创建并推送到远程`);
      onClose();
    } catch (err) {
      setPushRetryError(formatError(err, 'tag:push'));
    } finally {
      setBusy(false);
    }
  };

  const handleRetryPush = async () => {
    setPushRetryError(null);
    setBusy(true);
    try {
      await window.electronAPI.tag.push(repoPath, tagName);
      queryClient.invalidateQueries({ queryKey: ['tagRemoteTags', repoPath] });
      onNotice?.(`标签 "${tagName}" 已推送到远程`);
      onClose();
    } catch (err) {
      setPushRetryError(formatError(err, 'tag:push'));
    } finally {
      setBusy(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
    >
      <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-[420px] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="flex items-center gap-2 text-sm font-medium text-gray-100">
            <Tag className="w-4 h-4 text-yellow-400" />
            新建标签
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 pb-1 space-y-3">
          {/* 目标提交 */}
          <div className="flex items-center gap-2 bg-gray-900/60 border border-gray-700 rounded px-3 py-2 text-xs text-gray-400">
            <Hash className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <code className="font-mono text-gray-300 shrink-0">{commitHash.slice(0, 8)}</code>
            <span className="truncate" title={commitMessage}>{commitMessage || '（无提交说明）'}</span>
          </div>

          {/* 标签名称 */}
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="标签名称（如 v1.0.0）"
            autoFocus
            className="w-full bg-gray-700 text-gray-100 text-sm rounded px-3 py-2 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
          />
          {/* 标签说明 */}
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="标签说明（可选，留空创建轻量标签）"
            className="w-full bg-gray-700 text-gray-100 text-sm rounded px-3 py-2 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
          />

          {/* 创建后推送 */}
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              checked={pushAfterCreate}
              onChange={(e) => setPushAfterCreate(e.target.checked)}
              className="w-3.5 h-3.5 accent-yellow-600"
            />
            创建后推送到远程
          </label>

          {error && (
            <div className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span className="break-all">{error}</span>
            </div>
          )}
          {pushRetryError && (
            <div className="flex items-start gap-1 text-xs text-amber-400">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              <span className="break-all">标签 "{tagName}" 已创建，但推送到远程失败：{pushRetryError}</span>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700 mt-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors">
            取消
          </button>
          {pushRetryError ? (
            <button
              onClick={handleRetryPush}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-medium transition-colors"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {busy ? '推送中...' : '重试推送'}
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={!tagName || busy}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-medium transition-colors"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />}
              {busy ? '处理中...' : '创建'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
