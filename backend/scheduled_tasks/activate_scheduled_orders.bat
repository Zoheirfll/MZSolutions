@echo off
cd /d "%~dp0.."
venv\Scripts\python.exe manage.py activate_scheduled_orders >> scheduled_tasks\logs\activate_scheduled_orders.log 2>&1
