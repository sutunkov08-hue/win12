@echo off
chcp 65001 >nul
title Windows 12 - Launcher
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
  if errorlevel 1 (
    color 4F
    echo.
    echo  ОШИБКА установки. Проверь интернет и попробуй снова.
    pause
    exit /b
  )
)

color 2F
echo.
echo  =========================================
echo    ЗАПУСКАЮ WINDOWS 12...
echo    (окно откроется через пару секунд)
echo    НЕ ЗАКРЫВАЙ это чёрное окно, пока играешь!
echo  =========================================
echo.
call npm start
