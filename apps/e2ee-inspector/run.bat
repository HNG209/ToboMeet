@echo off
title ToboMeet - E2EE Media Inspector
cd /d "%~dp0"

REM Uu tien dung virtual environment da cai du cac goi livekit, opencv, pillow, sounddevice
if exist ".venv\Scripts\python.exe" (
    set "PYTHON_EXE=.venv\Scripts\python.exe"
) else if exist "..\livekit-agent\.venv\Scripts\python.exe" (
    set "PYTHON_EXE=..\livekit-agent\.venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

echo Dang khoi chay ToboMeet E2EE Inspector...
"%PYTHON_EXE%" main.py %*

