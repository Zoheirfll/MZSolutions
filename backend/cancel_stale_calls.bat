@echo off
cd /d "%~dp0"
"%~dp0venv\Scripts\python.exe" manage.py cancel_stale_calls
