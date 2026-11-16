@echo off
setlocal
set "BASKET_ROOT=%~dp0..\..\.."
set "PYTHON_EXE=%BASKET_ROOT%\.venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=python"
)

echo Starting Cherry Backend Server on 127.0.0.7:10000...
cd /d "%~dp0"
"%PYTHON_EXE%" run.py --host 127.0.0.7 --port 10000 %*
