@echo off
chcp 65001 >nul
title SmartVest 一鍵 GitHub 自動同步上傳工具
python "%~dp0auto_push_to_github.py"
pause
