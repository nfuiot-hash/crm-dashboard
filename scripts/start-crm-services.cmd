@echo off
setlocal
set "PROJECT_ROOT=%~dp0.."
powershell -ExecutionPolicy Bypass -File "%~dp0start-crm-services.ps1"
endlocal
