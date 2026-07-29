#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
準備 GitHub Pages 靜態編譯輸出檔 (Python 3.14)
"""

import os
import sys
import shutil
import time

# 強制控制台 UTF-8
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def deploy_dist_to_root():
    project_dir = os.path.dirname(os.path.abspath(__file__))
    dist_dir = os.path.join(project_dir, 'dist')
    
    if not os.path.exists(dist_dir):
        print("[X] 找不到 dist 編譯目錄")
        return

    # 複製 dist/assets 資料夾到根目錄
    dist_assets = os.path.join(dist_dir, 'assets')
    target_assets = os.path.join(project_dir, 'assets')
    
    if os.path.exists(target_assets):
        shutil.rmtree(target_assets)
        
    shutil.copytree(dist_assets, target_assets)
    print("[OK] 已成功複製編譯後的 assets JS/CSS 資源檔至根目錄！")

    # 複製與加工 index.html，寫入防快取標籤與 timestamp 版本號
    dist_html = os.path.join(dist_dir, 'index.html')
    target_html = os.path.join(project_dir, 'index.html')
    if os.path.exists(dist_html):
        with open(dist_html, 'r', encoding='utf-8') as f:
            content = f.read()

        ts = int(time.time())
        meta_tags = """<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <script>
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(regs) {
          for(let r of regs) r.unregister();
        });
      }
      if ('caches' in window) {
        caches.keys().then(function(names) {
          for (let n of names) caches.delete(n);
        });
      }
    </script>"""
        if '<head>' in content:
            content = content.replace('<head>', f'<head>\n    {meta_tags}')
        
        content = content.replace('.js"', f'.js?v={ts}"').replace('.css"', f'.css?v={ts}"')

        with open(target_html, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[OK] 已成功寫入 SW/Cache 清除指令與版本號 (v={ts}) 至 index.html！")

if __name__ == '__main__':
    deploy_dist_to_root()

