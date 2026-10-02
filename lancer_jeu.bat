@echo off
REM Lance le jeu « Le Donjon des Os » dans le navigateur (necessite Python).
cd /d "%~dp0game"
start "" http://localhost:8000
python -m http.server 8000 || py -m http.server 8000
pause
