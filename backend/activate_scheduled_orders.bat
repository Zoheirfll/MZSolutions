@echo off
cd /d "%~dp0"
"%~dp0venv\Scripts\python.exe" manage.py activate_scheduled_orders
