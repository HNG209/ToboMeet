@echo off
title ToboMeet - MLS vs. Pairwise E2EE Scalability Benchmark
cd /d "%~dp0"

echo =========================================================================
echo    TOBOMEET - E2EE SCALABILITY BENCHMARK (MLS TREEKEM VS. PAIRWISE)
echo    Graduation Thesis: Performance & Scalability Evaluation
echo =========================================================================
echo.

REM Prioritize Python environment containing cryptography and matplotlib
if exist "..\..\apps\livekit-agent\.venv\Scripts\python.exe" (
    set "PYTHON_EXE=..\..\apps\livekit-agent\.venv\Scripts\python.exe"
) else if exist "..\..\apps\e2ee-inspector\.venv\Scripts\python.exe" (
    set "PYTHON_EXE=..\..\apps\e2ee-inspector\.venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

echo [*] Target Python Interpreter: %PYTHON_EXE%
echo [*] Launching benchmark suite...
echo.

"%PYTHON_EXE%" benchmark.py --out-dir ./results %*

echo.
echo =========================================================================
echo  Benchmark complete. Check the 'results' directory for CSV and PNG plots.
echo =========================================================================
pause
