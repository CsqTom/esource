import type { ElectronAPI } from './index';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
  // 构建时由 vite.config 注入（见 scripts/version.mjs）
  const __APP_VERSION__: string;
  const __APP_BUILD_TIME__: string;
}

export {};