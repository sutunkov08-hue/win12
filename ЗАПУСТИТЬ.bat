@echo off
chcp 65001 >nul
title Windows 12 - Launcher
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  =====================================================
  echo   Node.js NOT INSTALLED!
  echo.
  echo   1. Otkroy sayt:  https://nodejs.org
  echo   2. Skachay versiyu LTS
  echo   3. Ustanovi kak obichnuyu programmu (Next, Next, Next)
  echo   4. Snova zapusti etot fayl
  echo  =====================================================
  echo.
  pause
  exit /b
)

if not exist node_modules (
  echo.
  echo  PERVY ZAPUSK: ustanavlivayu komponenty...
  echo  Eto zaymyot 1-2 minuty, prosto podozhdi.
  echo.
  call npm install
  if errorlevel 1 goto install_error
)

echo.
echo  =========================================
echo    ZAPUSKAYU WINDOWS 12...
echo    Ne zakryvay eto chornoe okno,
echo    poka khochesh, chtoby rabotala.
echo  =========================================
echo.
call npm start
goto end

:install_error
echo.
echo  OSHIBKA ustanovki. Prover internet i poprobuj snova.
echo  Esli ne poluchaetsya - prishli skrin okna.
pause
goto end

:end
pause
