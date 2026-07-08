@echo off
cd /d "%~dp0"
"%~dp0venv\Scripts\python.exe" manage.py send_abandoned_cart_reminders
