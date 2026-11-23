@echo off
chcp 65001 >nul
title Windows 12 - Builder
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
)

echo.
echo  =========================================
echo    SOBIRAYU USTANOVSHIK WINDOWS 12...
echo    Zaymyot 2-5 minut, NE zakryvay okno.
echo    Vse podrobnosti budut v fayle:
echo    build-log.txt
echo  =========================================
echo.

if exist build-log.txt del /q build-log.txt
call npm run dist > build-log.txt 2>&1
type build-log.txt

if not exist dist (
  color 4F
  echo.
  echo  =====================================================
  echo   SBORKA NE UDALAS. Smotri soobshcheniya vyshe ili
  echo   prishli soderzhimoe fayla build-log.txt.
  echo  =====================================================
  pause
  exit /b
)

color 2F
echo.
echo  =========================================
echo    GOTovo! Ustanovshik zdes:
echo.
echo    papka dist  -  fayl "Windows 12 Setup 1.0.0.exe"
echo    (ili podobnyy .exe imya)
echo.
echo    Ustanovi ego - i na rabochom stole
echo    poyavitsya yarchik "Windows 12"
echo  =========================================
echo.
start "" explorer "%~dp0dist"
pause
