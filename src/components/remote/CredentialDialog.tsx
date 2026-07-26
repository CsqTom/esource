import { useState } from 'react';
import { X, Eye, EyeOff, Key, Lock } from 'lucide-react';

interface CredentialDialogProps {
  url: string;
  errorMessage: string;
  onClose: () => void;
  onSave: (url: string, username: string, password: string) => Promise<void>;
}

export function CredentialDialog({
  url,
  errorMessage,
  onClose,
  onSave,
}: CredentialDialogProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(url, username.trim(), password);
    } catch (err: any) {
      setSaveError(String(err?.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl w-96 fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-medium text-gray-200">Git 身份验证</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* 错误信息 */}
          {errorMessage && (
            <div className="text-xs text-red-400 bg-red-900/30 rounded px-3 py-2 border border-red-800/50">
              {errorMessage}
            </div>
          )}

          {/* 远程地址 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">远程仓库</label>
            <div className="bg-gray-700 text-gray-300 rounded px-3 py-2 text-xs font-mono truncate" title={url}>
              {url}
            </div>
          </div>

          {/* 用户名 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">用户名</label>
            <div className="relative">
              <Key className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入用户名"
                autoFocus
                className="w-full bg-gray-700 text-gray-100 rounded pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              />
            </div>
          </div>

          {/* 密码 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">密码 / Access Token</label>
            <div className="relative">
              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码或 Access Token"
                className="w-full bg-gray-700 text-gray-100 rounded pl-8 pr-10 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* 提示 */}
          <p className="text-xs text-gray-500">
            凭据将保存到 git credential store，下次操作自动使用。
          </p>

          {/* 保存错误 */}
          {saveError && (
            <div className="text-xs text-red-400 bg-red-900/30 rounded px-3 py-2 border border-red-800/50">
              保存凭据失败: {saveError}
            </div>
          )}

          {/* 按钮 */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={isSaving || !username.trim() || !password}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
            >
              {isSaving ? '保存中...' : '登录并保存凭据'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 rounded transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}