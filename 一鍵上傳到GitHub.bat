@echo off
chcp 65001 >nul
title SmartVest 一鍵 GitHub 自動同步上傳工具

:: 自動將常見的 Git 安裝路徑加入 PATH 環境變數 (雙重保險)
set "PATH=%PATH%;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;C:\Program Files (x86)\Git\cmd;%LOCALAPPDATA%\Programs\Git\cmd"

python "%~dp0auto_push_to_github.py"
pause
