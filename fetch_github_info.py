#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
讀取 GitHub 倉庫最新版本與 Commit 紀錄 (Python 3.14)
"""

import sys
import json
import urllib.request
import subprocess

# 強制控制台採用 UTF-8
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def get_git_local_info():
    """取得本地端 Git 的最新 Commit"""
    try:
        res = subprocess.run("git log -n 5 --oneline", shell=True, capture_output=True, text=True, encoding='utf-8', errors='ignore')
        return res.stdout.strip()
    except Exception as e:
        return f"無法取得本地 Git log: {e}"

def fetch_github_cloud_commits():
    """連接 GitHub 雲端 API 讀取最新 Commit 資訊"""
    repo = "JeffHSU8310/SmartVest-"
    url = f"https://api.github.com/repos/{repo}/commits?per_page=5"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/vnd.github+json'
    }
    
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode('utf-8'))
                commits_info = []
                for item in data:
                    sha = item.get('sha', '')[:7]
                    commit_msg = item.get('commit', {}).get('message', '').split('\n')[0]
                    author_date = item.get('commit', {}).get('author', {}).get('date', '')
                    commits_info.append({
                        'sha': sha,
                        'message': commit_msg,
                        'date': author_date
                    })
                return True, commits_info
            else:
                return False, f"HTTP Status {resp.status}"
    except Exception as e:
        return False, str(e)

def main():
    print("=" * 65)
    print("  正在連接 SmartVest- GitHub 雲端儲存庫讀取最新版本資訊")
    print("=" * 65)
    
    print("\n【1. 本地 Git 庫 Commit 紀錄】")
    local_log = get_git_local_info()
    print(local_log)
    
    print("\n【2. GitHub 雲端 REST API 最新版本數據】")
    success, result = fetch_github_cloud_commits()
    if success:
        print("✅ 成功連線 GitHub API 取得雲端最新 5 筆提交紀錄：\n")
        for i, c in enumerate(result, 1):
            print(f"   {i}. [{c['sha']}] {c['message']} (時間: {c['date']})")
    else:
        print(f"⚠️ 連線至 GitHub API 讀取失敗/受限: {result}")
    
    print("\n" + "=" * 65)

if __name__ == '__main__':
    main()
