#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartVest 存股記帳系統 - 一鍵 GitHub 自動同步上傳工具 (Python 3.14 完美編譯發布版)
功能：自動執行 Vite 靜態編譯、複製發布資源，並上傳至 GitHub，解決 GitHub Pages 畫面全白問題。
"""

import os
import sys
import subprocess
import shutil
import webbrowser

# 強制 Windows 控制台輸出採用 utf-8
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def find_git_executable():
    """自動尋找系統中 Git 的執行檔完整路徑"""
    try:
        res = subprocess.run("git --version", shell=True, capture_output=True, text=True)
        if res.returncode == 0:
            return "git"
    except Exception:
        pass

    possible_paths = [
        r"C:\Program Files\Git\cmd\git.exe",
        r"C:\Program Files\Git\bin\git.exe",
        r"C:\Program Files (x86)\Git\cmd\git.exe",
        os.path.expanduser(r"~\AppData\Local\Programs\Git\cmd\git.exe"),
    ]

    for p in possible_paths:
        if os.path.exists(p):
            return f'"{p}"'
            
    return None

def run_git_cmd(git_bin, git_args, cwd=None, print_output=False):
    """使用找到的 git 執行檔執行指令"""
    cmd = f'{git_bin} {git_args}'
    try:
        if print_output:
            res = subprocess.run(cmd, cwd=cwd, shell=True, text=True, errors='ignore')
            return res.returncode == 0, ""
        else:
            res = subprocess.run(
                cmd, 
                cwd=cwd, 
                shell=True, 
                capture_output=True, 
                text=True, 
                encoding='utf-8', 
                errors='ignore'
            )
            return res.returncode == 0, (res.stdout + "\n" + res.stderr).strip()
    except Exception as e:
        return False, str(e)

def build_and_prepare_assets(project_dir):
    """自動執行 Vite 打包並將資源複製至根目錄"""
    print("[+] 正在為 GitHub Pages 進行程式碼編譯與靜態資源打包 (npm run build)...")
    try:
        res = subprocess.run("cmd /c \"npm run build\"", cwd=project_dir, shell=True, capture_output=True, text=True)
        dist_dir = os.path.join(project_dir, 'dist')
        dist_assets = os.path.join(dist_dir, 'assets')
        # 必須取 dist/app.html：Vite 進入點是 app.html（見 vite.config.ts）。
        # 根目錄 index.html 是部署產物，若當成進入點會讓 Vite 停止編譯原始碼。
        dist_html = os.path.join(dist_dir, 'app.html')
        
        target_assets = os.path.join(project_dir, 'assets')
        target_html = os.path.join(project_dir, 'index.html')
        
        if os.path.exists(dist_assets):
            if os.path.exists(target_assets):
                shutil.rmtree(target_assets)
            shutil.copytree(dist_assets, target_assets)
            
        if os.path.exists(dist_html):
            shutil.copy(dist_html, target_html)
            
        print("[✓] 靜態頁面編譯與相依資源準備完成！(有效解決畫面全白問題)")
        return True
    except Exception as e:
        print(f"[!] 編譯預準備跳過: {e}")
        return False

def main():
    print("=" * 65)
    print("  SmartVest 存股記帳系統 - 一鍵 GitHub 自動同步上傳工具")
    print("=" * 65)
    
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)

    # 1. 偵測 Git 工具
    git_bin = find_git_executable()
    if not git_bin:
        print("\n[X] 錯誤：在您的電腦中未找到 Git 工具！")
        sys.exit(1)

    ok, output = run_git_cmd(git_bin, "--version")
    print(f"[✓] 已自動偵測到系統 Git 環境: {output}")

    # 2. 自動執行 Vite 編譯與發布資源準備
    build_and_prepare_assets(project_dir)

    # 3. 檢查遠端倉庫網址 (Remote URL)
    ok, remote_url = run_git_cmd(git_bin, "remote get-url origin")
    if not ok or not remote_url:
        remote_url = "https://github.com/JeffHSU8310/SmartVest-.git"
        run_git_cmd(git_bin, f'remote add origin "{remote_url}"')

    print(f"[✓] 已連線至 GitHub 倉庫: {remote_url}")

    # 4. 自動揀選與暫存檔案
    print("\n[+] 正在過濾並暫存發布檔案...")
    run_git_cmd(git_bin, "add .")

    # 5. 進行 Commit
    commit_msg = "feat: Deploy built static release for GitHub Pages"
    run_git_cmd(git_bin, f'commit -m "{commit_msg}"')

    # 6. 推送至 GitHub 雲端
    print("\n[+] 正在將最新頁面檔案同步上傳至 GitHub (git push origin main)...")
    print("-" * 65)
    
    push_ok, _ = run_git_cmd(git_bin, "push -u origin main", print_output=True)

    if not push_ok:
        push_ok, _ = run_git_cmd(git_bin, "push -u origin HEAD:main", print_output=True)

    print("-" * 65)

    if push_ok:
        print("\n" + "=" * 65)
        print(" 🎉 恭喜！最新編譯發布檔案已成功上傳至 GitHub！")
        print("=" * 65)
        
        pages_url = "https://jeffhsu8310.github.io/SmartVest-/"
        print(f"\n🌐 正在為您自動開啟 GitHub Pages 網頁驗證畫面：")
        print(f"   {pages_url}\n")
        try:
            webbrowser.open(pages_url)
        except Exception:
            pass
    else:
        print("\n❌ 上傳提示：請確認網路連線或 GitHub 登入權限。")

    input("\n按 Enter 鍵結束...")

if __name__ == '__main__':
    main()
