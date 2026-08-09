@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Python environment is missing. Run: py -3.11 -m venv .venv
  echo Then run: pip install -r requirements.txt
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m uvicorn --app-dir backend harmonize_server.main:app --host 127.0.0.1 --port 8765
