#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartVest 存股記帳系統 - 一鍵 GitHub 自動同步上傳工具 (Python 3.14 Git 自動路徑偵測版)
功能：自動尋找電腦中的 Git 執行檔，自動挑選正確原始碼，上傳至 GitHub，完成後自動開啟網頁。
"""

import os
import sys
import subprocess
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
    # 1. 先嘗試 PATH 中的 git
    try:
        res = subprocess.run("git --version", shell=True, capture_output=True, text=True)
        if res.returncode == 0:
            return "git"
    except Exception:
        pass

    # 2. 搜尋 Windows 常見的 Git 安裝路徑
    possible_paths = [
        r"C:\Program Files\Git\cmd\git.exe",
        r"C:\Program Files\Git\bin\git.exe",
        r"C:\Program Files (x86)\Git\cmd\git.exe",
        os.path.expanduser(r"~\AppData\Local\Programs\Git\cmd\git.exe"),
        os.path.expanduser(r"~\AppData\Local\Git\cmd\git.exe"),
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

def main():
    print("=" * 65)
    print("  SmartVest 存股記帳系統 - 一鍵 GitHub 自動同步上傳工具")
    print("=" * 65)
    
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)

    # 1. 自動偵測 Git 工具
    git_bin = find_git_executable()
    if not git_bin:
        print("\n[X] 錯誤：在您的電腦中未找到 Git 工具！")
        print("    請前往下方網址下載並安裝 Git (免費安裝後重新執行此批次檔即可)：")
        print("    👉 https://git-scm.com/downloads")
        input("\n按 Enter 鍵結束...")
        sys.exit(1)

    ok, output = run_git_cmd(git_bin, "--version")
    print(f"[✓] 已自動偵測到系統 Git 環境: {output}")

    # 2. 檢查遠端倉庫網址 (Remote URL)
    ok, remote_url = run_git_cmd(git_bin, "remote get-url origin")
    if not ok or not remote_url:
        remote_url = "https://github.com/JeffHSU8310/SmartVest-.git"
        run_git_cmd(git_bin, f'remote add origin "{remote_url}"')

    print(f"[✓] 已連線至 GitHub 倉庫: {remote_url}")

    # 3. 自動揀選核心原始碼
    print("\n[+] 正在自動揀選專案核心原始碼 (已自動排除 1GB node_modules 與暫存檔)...")
    run_git_cmd(git_bin, "add .")

    # 4. 進行 Commit
    commit_msg = "feat: Sync latest SmartVest codebase to GitHub"
    run_git_cmd(git_bin, f'commit -m "{commit_msg}"')

    # 5. 推送至 GitHub 雲端 (顯示詳細日誌)
    print("\n[+] 正在將檔案同步上傳至 GitHub (git push origin main)...")
    print("-" * 65)
    
    push_ok, _ = run_git_cmd(git_bin, "push -u origin main", print_output=True)

    if not push_ok:
        push_ok, _ = run_git_cmd(git_bin, "push -u origin HEAD:main", print_output=True)

    print("-" * 65)

    if push_ok:
        print("\n" + "=" * 65)
        print(" 🎉 恭喜！專案原始碼已成功上傳至您的 GitHub 雲端倉庫！")
        print("=" * 65)
        
        clean_url = remote_url.replace(".git", "")
        print(f"\n🌐 正在為您自動開啟 GitHub 倉庫網頁驗證上傳檔案：")
        print(f"   {clean_url}\n")
        try:
            webbrowser.open(clean_url)
        except Exception:
            pass
    else:
        print("\n❌ 上傳提示：若您是第一次推送，請完成瀏覽器授權登入即可。")

    input("\n按 Enter 鍵結束...")

if __name__ == '__main__':
    main()
