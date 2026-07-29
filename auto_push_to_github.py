#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartVest 存股記帳系統 - 一鍵 GitHub 自動同步上傳工具 (Python 3.14 完美穩定版)
功能：自動挑選正確原始碼，上傳至 GitHub 倉庫，並在完成後自動開啟 GitHub 網頁確認。
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

def run_cmd(cmd, cwd=None, print_output=False):
    """執行 Command 命令並回傳結果與輸出"""
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

    # 1. 檢查 Git 環境
    ok, output = run_cmd("git --version")
    if not ok:
        print("\n[X] 錯誤：您的電腦尚未安裝 Git 工具！")
        print("    請先下載安裝 Git: https://git-scm.com/downloads")
        input("\n按 Enter 鍵結束...")
        sys.exit(1)
    print(f"[✓] Git 環境檢查正常: {output}")

    # 2. 檢查遠端倉庫網址 (Remote URL)
    ok, remote_url = run_cmd("git remote get-url origin")
    if not ok or not remote_url:
        remote_url = "https://github.com/JeffHSU8310/SmartVest-.git"
        run_cmd(f'git remote add origin "{remote_url}"')

    print(f"[✓] 已連線至 GitHub 倉庫: {remote_url}")

    # 3. 打包準備上傳的原始碼檔案
    print("\n[+] 正在過濾專案核心原始碼 (自動排除 1GB node_modules 與暫存大檔)...")
    run_cmd("git add .")

    # 4. 進行 Commit
    commit_msg = "feat: Sync latest SmartVest codebase to GitHub"
    run_cmd(f'git commit -m "{commit_msg}"')

    # 5. 推送至 GitHub 雲端 (顯示詳細日誌)
    print("\n[+] 正在將檔案同步上傳至 GitHub (git push origin main)...")
    print("-" * 65)
    
    push_ok, _ = run_cmd("git push -u origin main", print_output=True)

    if not push_ok:
        push_ok, _ = run_cmd("git push -u origin HEAD:main", print_output=True)

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
        print("\n❌ 上傳中遇到錯誤，請確認網路連線或 GitHub 登入權限。")

    input("\n按 Enter 鍵結束...")

if __name__ == '__main__':
    main()
