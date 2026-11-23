@echo off
chcp 65001 >nul
title Windows 12 - Builder
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  color 4F
  echo.
  echo  =====================================================
  echo   Node.js НЕ УСТАНОВЛЕН!
  echo.
  echo   1. Зайди на сайт:  https://nodejs.org
  echo   2. Скачай версию LTS (зелёная кнопка)
  echo   3. Установи как обычную программу
  echo   4. Снова запусти этот файл
  echo  =====================================================
  echo.
  pause
  exit /b
)

if not exist node_modules (
  color 3F
  echo.
  echo  ПЕРВЫЙ ЗАПУСК: устанавливаю компоненты...
  echo  Это займёт 1-2 минуты, просто подожди.
  echo.
  call npm install
)

color 3F
echo.
echo  =========================================
echo    СОБИРАЮ УСТАНОВЩИК WINDOWS 12...
echo    Займёт 2-5 минут, подожди.
echo  =========================================
echo.
call npm run dist
if errorlevel 1 (
  color 4F
  echo.
  echo  ОШИБКА сборки. Сфоткай/скопируй текст выше и покажи мне.
  pause
  exit /b
)

color 2F
echo.
echo  =========================================
echo    ГОТОВО! Установщик здесь:
echo.
echo    папка dist  -  файл "Windows 12 Setup 1.0.0.exe"
echo.
echo    Установи его - и на рабочем столе
echo    появится ярлык "Windows 12"
echo  =========================================
echo.
start "" "dist"
pause
