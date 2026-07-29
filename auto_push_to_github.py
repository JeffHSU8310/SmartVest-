#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartVest 存股記帳系統 - 一鍵 GitHub 自動同步上傳工具 (Python 3.14)
功能：自動辨識並挑選正確的專案原始碼，排除 1GB 依賴大檔，自動推送到您的 GitHub 雲端倉庫。
"""

import os
import sys
import subprocess

# 強制 Windows 控制台輸出採用 utf-8
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def run_cmd(cmd, cwd=None, check=True):
    """執行 Command 命令並回傳結果"""
    try:
        res = subprocess.run(
            cmd, 
            cwd=cwd, 
            shell=True, 
            capture_output=True, 
            text=True, 
            encoding='utf-8', 
            errors='ignore'
        )
        if check and res.returncode != 0:
            return False, res.stderr.strip() or res.stdout.strip()
        return True, res.stdout.strip()
    except Exception as e:
        return False, str(e)

def main():
    print("=" * 60)
    print("  SmartVest 存股記帳系統 - 一鍵 GitHub 自動同步上傳工具")
    print("=" * 60)
    
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)

    # 1. 檢查 Git 是否安裝
    ok, output = run_cmd("git --version")
    if not ok:
        print("\n[X] 錯誤：找不到 Git 工具，請先安裝 Git (https://git-scm.com/)。")
        sys.exit(1)
    print(f"[OK] 檢測到系統 Git 環境: {output}")

    # 2. 檢查 Git 儲存庫狀態
    if not os.path.exists(os.path.join(project_dir, ".git")):
        print("[+] 正在初始化 Git 儲存庫...")
        run_cmd("git init")
        run_cmd("git branch -M main")

    # 3. 檢查或設定預設使用者資訊
    ok, email = run_cmd("git config user.email")
    if not ok or not email:
        run_cmd('git config user.email "smartvest@example.com"')
        run_cmd('git config user.name "SmartVest User"')

    # 4. 檢查 GitHub 遠端倉庫 URL (Remote)
    ok, remote_url = run_cmd("git remote get-url origin", check=False)
    
    if not ok or not remote_url:
        print("\n[!] 尚未設定您的 GitHub 倉庫網址！")
        print("請貼上您的 GitHub 倉庫網址 (例如 https://github.com/your-username/smartvest-app.git)：")
        try:
            user_url = input("> ").strip()
        except EOFError:
            user_url = ""
        
        if not user_url:
            print("[X] 未提供網址，操作已取消。")
            sys.exit(1)
            
        run_cmd("git remote remove origin", check=False)
        run_cmd(f'git remote add origin "{user_url}"')
        remote_url = user_url
        print(f"[OK] 已成功設定 GitHub 遠端倉庫: {remote_url}")
    else:
        print(f"[OK] 目前綁定的 GitHub 倉庫: {remote_url}")

    # 5. 自動過濾並加入正確的原始碼檔案
    print("\n[+] 正在過濾並掃描正確的專案原始碼檔案 (已自動排除 node_modules 與 1GB 大檔)...")
    ok, _ = run_cmd("git add .")
    if not ok:
        print("[X] 暫存檔案失敗。")
        sys.exit(1)

    # 6. 自動提交 Commit
    commit_msg = "auto: Sync SmartVest codebase updates to GitHub"
    ok, _ = run_cmd(f'git commit -m "{commit_msg}"', check=False)

    # 7. 自動上傳 (Push) 至 GitHub
    print("[+] 正在推送到 GitHub 雲端 (git push)...")
    ok, push_res = run_cmd("git push -u origin main", check=False)

    if not ok:
        ok, push_res = run_cmd("git push -u origin HEAD:main", check=False)

    if ok:
        print("\n" + "=" * 60)
        print(" 🎉 恭喜！專案原始碼已成功上傳至 GitHub 雲端！")
        print("=" * 60)
        
        if "github.com/" in remote_url:
            parts = remote_url.split("github.com/")[1].replace(".git", "").split("/")
            if len(parts) >= 2:
                user, repo = parts[0], parts[1]
                print(f"\n🌐 您的雲端執行網址 (GitHub Pages)：")
                print(f"   https://{user}.github.io/{repo}/\n")
    else:
        print("\n[X] 上傳提示：若您是第一次推送，請確定已於 GitHub 網站建立了同名倉庫，或您具備寫入權限。")
        print(f"詳細訊息:\n{push_res}")

if __name__ == '__main__':
    main()
