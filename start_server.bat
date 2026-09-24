@echo off
echo ========================================================
echo Starting Courier Office Employee Management System...
echo ========================================================
cd /d %~dp0
call .venv\Scripts\activate.bat
echo Starting web server on http://127.0.0.1:8000 ...
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause
