@echo off
cd /d "%~dp0"
chcp 65001 >nul
echo ============================================================
echo  Iniciando WordAPA7 (modo desarrollo)...
echo ============================================================
echo.
echo El backend corre en HTTPS (https://localhost:8742).
echo El certificado SSL se genera e instala automaticamente
echo en el Trusted Root store de Windows (silenciosamente, sin dialogos).
echo.
echo Complemento de Word (Add-in):
echo   - Se registra AUTOMATICAMENTE al iniciar el backend.
echo   - No necesitas ejecutar ningun script adicional.
echo   - Abre Word y busca la pestana "WordAPA7" arriba.
echo   - Si no aparece, cierra Word completamente y vuelvelo a abrir.
echo.
echo NOTA: Este script es para DESARROLLO. En produccion, el watcher
echo ligero (word_watcher.py) se encarga de todo automaticamente:
echo   - Se inicia al iniciar sesion en Windows
echo   - Detecta cuando abres Word y arranca el backend
echo   - Lo detiene cuando cierras Word (ahorra recursos)
echo   - No necesitas tener esta ventana abierta
echo.
echo Cierra esta ventana para detener el backend.
echo.
if exist "venv\Scripts\python.exe" (
    "venv\Scripts\python" python\main.py
) else (
    python python\main.py
)
pause
