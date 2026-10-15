@echo off
rem cross-chat launcher (ASCII only: cmd.exe parses .cmd as GBK).
rem Finds a Node >= 22 runtime and runs the bundled CLI with the given arguments.
rem A too-old node on PATH is skipped in favour of the runtime that ships with the client.
rem NOTE: deliberately no parenthesised blocks and no "(" in any message here -- parentheses inside an
rem `if (` block break cmd's block matching, and %ERRORLEVEL% inside a block is expanded when the block
rem is parsed, so a failed delivery would be reported as success.
setlocal
set "HERE=%~dp0"
set "ENTRY=%HERE%bin\cross-chat.js"
set "NEED=process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)"
set "NODE="

rem 1) node on PATH -- only if it is new enough
for /f "delims=" %%N in ('where node 2^>nul') do call :check "%%N"

rem 2) the Tuanjie Cowork / Codely client ships its own runtime
call :check "%CODELY_HOME%\node.exe"
call :check "%CODELY_CLI_BASE_DIR%\bin\win32-x64\node.exe"
call :check "%CODELY_CLI_BASE_DIR%\bin\win32-arm64\node.exe"
call :check "%CODELY_APP_HOME%\cli\bin\win32-x64\node.exe"
call :check "%CODELY_APP_HOME%\cli\bin\win32-arm64\node.exe"
if not defined NODE for /f "delims=" %%C in ('where codely 2^>nul') do call :check "%%~dpCnode.exe"

rem 3) common install locations
call :check "%ProgramFiles%\Tuanjie Cowork\cli\bin\win32-x64\node.exe"
call :check "%LOCALAPPDATA%\Tuanjie Cowork\cli\bin\win32-x64\node.exe"
call :check "%LOCALAPPDATA%\Programs\Tuanjie Cowork\cli\bin\win32-x64\node.exe"

if not defined NODE goto no_runtime
rem `call` matters: without it, a .cmd shim (nvm/fnm style) takes over this batch and the CLI never runs.
call "%NODE%" "%ENTRY%" %*
exit /b %ERRORLEVEL%

:check
if defined NODE goto :eof
if "%~1"=="" goto :eof
if not exist "%~1" goto :eof
call "%~1" -e "%NEED%" >nul 2>nul
if not errorlevel 1 goto check_use
echo [cross-chat] ignoring "%~1": it is older than Node 22 - the CLI needs node:sqlite.
goto :eof

:check_use
set "NODE=%~1"
goto :eof

:no_runtime
echo [cross-chat] No usable Node runtime found - need Node 22 or newer. Install Node 22+, or install and start Tuanjie Cowork, then retry.
exit /b 127
