import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 關鍵：Electron 打包必須使用相對路徑 ./ 才能正確載入 CSS/JS
  build: {
    rollupOptions: {
      // 進入點必須是 app.html（內含 <script src="/index.tsx">）。
      // 根目錄的 index.html 是「部署產物」，由 prepare_gh_pages.py 覆寫；
      // 若拿它當進入點，Vite 只會看到已編譯的 assets/*.js 並把舊產物再包一層，
      // 從此不再編譯任何 .ts/.tsx —— 原始碼的修改將永遠不會生效。
      input: resolve(__dirname, 'app.html')
    }
  },
  server: {
    port: 5173,
    strictPort: true,
  }
});