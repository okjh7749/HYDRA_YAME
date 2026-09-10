@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo [오류] Node.js가 설치되어 있지 않거나 PATH에 등록되어 있지 않습니다.
  echo Node.js LTS를 설치한 뒤 이 파일을 다시 더블클릭하세요.
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "src\dev-server.mjs" (
  echo.
  echo [오류] src\dev-server.mjs 파일을 찾을 수 없습니다.
  echo 실행.bat 파일을 HYDRA_YAME 프로젝트 최상위 폴더에서 실행하세요.
  echo.
  pause
  exit /b 1
)

echo ========================================
echo   HYDRA TERRITORY 서버를 시작합니다.
echo ========================================
echo.
echo 멀티플레이: http://127.0.0.1:8080
echo 클래식 모드: http://127.0.0.1:8080/classic
echo.
echo 서버 창을 종료하면 게임 서버도 종료됩니다.
echo.

start "Hydra Territory Server" /D "%~dp0" cmd /k "node src\dev-server.mjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8080"
