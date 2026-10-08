@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo  WordAPA7 - Instalacion inicial
echo ============================================
echo.

echo [1/5] Instalando dependencias Python...
if exist "venv\Scripts\python.exe" (
    "venv\Scripts\python" -m pip install --disable-pip-version-check -q --upgrade pip
    "venv\Scripts\python" -m pip install --disable-pip-version-check -r requirements.txt
) else (
    python -m pip install --disable-pip-version-check -q --upgrade pip
    python -m pip install --disable-pip-version-check -r requirements.txt
)
if errorlevel 1 (
    echo ERROR: Fallo la instalacion de dependencias Python.
    echo Asegurate de tener Python 3.11+ instalado.
    pause
    exit /b 1
)

echo.
echo [2/5] Instalando dependencias Node...
call npm install
if errorlevel 1 (
    echo ERROR: Fallo la instalacion de dependencias Node.
    echo Asegurate de tener Node.js 18+ instalado.
    pause
    exit /b 1
)

echo.
echo [3/5] Construyendo interfaz y plantilla...
call npm run build
"venv\Scripts\python" python\create_template.py 2>nul || python python\create_template.py 2>nul

echo.
echo [4/5] Construyendo complemento de Word...
cd word-addin && call npm install && call npm run build && cd ..
if errorlevel 1 (
    echo WARNING: Fallo la construccion del complemento de Word.
    echo El complemento no es obligatorio para el funcionamiento principal.
) else (
    echo [OK] Complemento de Word construido correctamente.
)

echo.
echo [5/5] Registrando servicio en segundo plano...
REM ── Registrar el Watcher en el inicio de Windows ──────────────────────────
REM El watcher es un proceso LIGERO (~8MB RAM) que:
REM   1. Se inicia al iniciar sesion en Windows
REM   2. Detecta cuando abres Word
REM   3. Arranca el backend automaticamente
REM   4. Lo detiene cuando cierras Word (ahorra recursos)
REM
REM Usa HKCU (no requiere admin) y pythonw.exe (sin ventana de consola).
REM El usuario NO tiene que hacer nada: es completamente invisible.

set "WATCHER_CMD="
if exist "venv\Scripts\pythonw.exe" (
    set "WATCHER_CMD=venv\Scripts\pythonw.exe "%~dp0python\word_watcher.py""
) else (
    where pythonw >nul 2>nul && (
        set "WATCHER_CMD=pythonw.exe "%~dp0python\word_watcher.py""
    )
)

if defined WATCHER_CMD (
    reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "WordAPA7Watcher" /t REG_SZ /d "%WATCHER_CMD%" /f >nul 2>nul
    if errorlevel 1 (
        echo WARNING: No se pudo registrar el watcher en el inicio de Windows.
        echo El backend tendra que arrancarse manualmente con start.bat.
    ) else (
        echo [OK] Watcher registrado en el inicio de Windows.
        echo      El servicio se iniciara automaticamente al iniciar sesion.
    )
) else (
    echo WARNING: pythonw.exe no encontrado. El watcher no se registrara.
    echo      El backend tendra que arrancarse manualmente con start.bat.
)

echo.
echo ============================================
echo  Instalacion completada correctamente.
echo ============================================
echo.
echo IMPORTANTE - Como funciona:
echo   - El servicio se inicia SOLO al abrir Word.
echo   - No necesitas abrir la app de escritorio.
echo   - No necesitas ejecutar ningun script.
echo   - No necesitas aceptar advertencias de certificado.
echo   - Solo abre Word y busca la pestana "WordAPA7" arriba.
echo   - Si no aparece, cierra Word completamente y vuelvelo a abrir.
echo.
echo   El servicio se cierra solo cuando cierres Word (ahorra recursos).
echo.
pause
