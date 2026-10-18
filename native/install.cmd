@echo off
rem install.cmd - runs install.ps1 next to it (Windows): double-click to install the Forte plugins
rem in this folder, or run "install.cmd verify", "install.cmd uninstall vst3"... from a terminal.
rem native/install.cmd in https://github.com/jdthaler/forte.
setlocal
rem Windows PowerShell finds its own modules only with PSModulePath unset: run from PowerShell 7,
rem it would inherit 7's, and cmdlets such as Get-FileHash would be missing.
set "PSModulePath="
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set forte_exit=%errorlevel%
if "%~1"=="" pause
exit /b %forte_exit%
