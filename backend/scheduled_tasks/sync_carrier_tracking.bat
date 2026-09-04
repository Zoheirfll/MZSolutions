@echo off
cd /d "%~dp0.."
venv\Scripts\python.exe manage.py sync_carrier_tracking >> scheduled_tasks\logs\sync_carrier_tracking.log 2>&1
