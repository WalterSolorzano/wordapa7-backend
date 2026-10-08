@echo off
REM ===========================================================================
REM  WordAPA7 — Lanzador del Add-in de Word (servidor de desarrollo)
REM  -------------------------------------------------------------------------
REM  Por DEFECTO levanta el servidor en http://localhost:3000 (HTTP plano).
REM
REM  REQUISITO PREVIO: El backend de Python debe estar corriendo
REM  (ejecuta start.bat en la raiz del proyecto o `python python/main.py`).
REM
REM  OPCIONES PARA CARGAR EL COMPLEMENTO EN WORD:
REM
REM  OPCION 1 — Word Online (Recomendado para pruebas rapidas):
REM    1. Abre un documento en https://office.com (Word en navegador).
REM    2. Pestana Insertar -> Complementos (o "Mis complementos").
REM    3. Haz clic en "Cargar mi complemento" (Upload My Add-in).
REM    4. Selecciona el archivo "manifest.xml" de la carpeta word-addin.
REM
REM  OPCION 2 — Word Desktop (Windows):
REM    Abre otra terminal y ejecuta en la carpeta word-addin:
REM       npx office-addin-debugging start manifest.xml desktop --app word
REM    O bien usa el mecanismo automatico del instalador de WordAPA7.
REM ===========================================================================

setlocal
cd /d "%~dp0"

if not exist "node_modules" (
  echo [WordAPA7 Add-in] Instalando dependencias (primera vez)...
  call npm install
  if errorlevel 1 (
    echo [ERROR] No se pudieron instalar las dependencias del add-in.
    pause
    exit /b 1
  )
)

echo [WordAPA7 Add-in] Validando manifiesto XML...
call npx office-addin-manifest validate manifest.xml
echo.

echo ===========================================================================
echo  WordAPA7 Add-in Server iniciando en http://localhost:3000
echo  Para Word Online: Insertar -> Complementos -> Cargar mi complemento -> manifest.xml
echo  Para depuracion directa en Word Desktop: npx office-addin-debugging start manifest.xml desktop
echo ===========================================================================
echo.

call npm run dev

endlocal

