@echo off
set HTTP_PROXY=http://127.0.0.1:10809
set HTTPS_PROXY=http://127.0.0.1:10809
set ALL_PROXY=http://127.0.0.1:10809
set NO_PROXY=localhost,127.0.0.1,::1

set http_proxy=http://127.0.0.1:10809
set https_proxy=http://127.0.0.1:10809
set all_proxy=http://127.0.0.1:10809
set no_proxy=localhost,127.0.0.1,::1

start "" "%LOCALAPPDATA%\Microsoft\WindowsApps\Codex.exe"
