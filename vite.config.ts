import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { execSync } from 'child_process';

// dev/build 启动时从本地 git 生成版本信息（写入 version.json 并同步 package.json 的 version）
const versionInfo = JSON.parse(
  execSync(`node "${path.resolve(__dirname, 'scripts/version.mjs')}"`, { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .pop() || '{}',
);
process.env.VITE_APP_VERSION = versionInfo.display || '';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(versionInfo.display || ''),
    __APP_BUILD_TIME__: JSON.stringify(versionInfo.builtAt || ''),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});