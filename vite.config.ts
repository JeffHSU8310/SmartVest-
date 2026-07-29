import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 關鍵：Electron 打包必須使用相對路徑 ./ 才能正確載入 CSS/JS
  server: {
    port: 5173,
    strictPort: true,
  }
});