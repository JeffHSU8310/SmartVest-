#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
準備 GitHub Pages 靜態編譯輸出檔 (Python 3.14)
"""

import os
import sys
import shutil

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

if __name__ == '__main__':
    deploy_dist_to_root()
