@echo off
cd /d "%~dp0.."
venv\Scripts\python.exe manage.py cancel_stale_calls >> scheduled_tasks\logs\cancel_stale_calls.log 2>&1
