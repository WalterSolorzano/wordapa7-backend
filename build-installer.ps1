# build-installer.ps1 - Chained build script to work around Windows Defender interference
# Step 1: Build unpacked app (--dir)
# Step 2: Immediately create 7z archive before Defender quarantines files
# Step 3: Create NSIS installer using --prepackaged

$ErrorActionPreference = "Continue"
$projectDir = $PSScriptRoot
Set-Location $projectDir

# ── Versión dinámica desde package.json ──────────────────────────────────────
# ANTES la versión estaba hardcodeada (1.0.34), lo que rompía el build cuando
# package.json se actualizaba (ej. a 1.0.35): electron-builder nombra el 7z y el
# instalador con la versión de package.json, pero este script buscaba el nombre
# viejo y reportaba "FAILED: Installer not created" aunque el build hubiera ido
# bien. Ahora se lee dinámicamente para que siempre coincidan.
try {
    $pkg = Get-Content "$projectDir\package.json" -Raw | ConvertFrom-Json
    $appVersion = $pkg.version
    if (-not $appVersion) { throw "version vacía en package.json" }
} catch {
    Write-Output "ERROR: No se pudo leer la versión desde package.json: $_"
    exit 1
}
Write-Output "Versión detectada desde package.json: $appVersion"

$sevenZip = "$env:LOCALAPPDATA\electron-builder\Cache\7zip@1.0.0\7zip-win-x64-a34pt\bin\7za.exe"
$archiveFile = "dist-electron-builder\wordapa7-$appVersion-x64.nsis.7z"
$installerPath = "dist-electron-builder\WordAPA7 Setup $appVersion.exe"

# Kill any leftover processes
Get-Process WordAPA7,electron,7za,python,pythonw,WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# ── Purgar caché de Electron del entorno de desarrollo ───────────────────────
# El caché de Electron puede tener JS compilado de versiones anteriores aunque
# el app.asar sea nuevo. Esto causaba que el instalador pareciera tener código
# viejo: el binario era correcto pero el caché en %APPDATA% prevalecía.
# Se purga aquí (antes del build) para garantizar que dev y usuario final
# siempre ejecutan la versión recién compilada. Mismo mecanismo que customInstall.
$electronCacheDir = "$env:APPDATA\wordapa7"
$electronCacheDirs = @("Cache", "Code Cache", "GPUCache", "DawnGraphiteCache", "DawnWebGPUCache")
foreach ($d in $electronCacheDirs) {
    $target = Join-Path $electronCacheDir $d
    if (Test-Path $target) {
        Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
        Write-Output "Cache purgado: $target"
    }
}
Write-Output "=== Cache de Electron limpiado ==="

# Clean output directory with retry loop
if (Test-Path dist-electron-builder) {
    for ($i = 0; $i -lt 5; $i++) {
        try {
            Remove-Item -Recurse -Force dist-electron-builder -ErrorAction Stop
            break
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
}
New-Item -ItemType Directory -Path dist-electron-builder | Out-Null

Write-Output "=== STEP 0: Compiling frontend, electron and word-addin (npm run build) ==="
$buildOut = & cmd /c "npm run build 2>&1"
Write-Output $buildOut
if ($LASTEXITCODE -ne 0) {
    Write-Output "ERROR: npm run build failed with exit code $LASTEXITCODE. Aborting installer build."
    exit 1
}

Write-Output "=== STEP 0.5: Building embedded Python runtime + AI keys ==="
# ── Claves de IA ofuscadas (payload) ────────────────────────────────────────
& python "$projectDir\python\embed_payload.py"
if ($LASTEXITCODE -ne 0) {
    Write-Output "ERROR: embed_payload.py failed with exit code $LASTEXITCODE. Aborting installer build."
    exit 1
}

# ── Runtime embebido (python.exe + DLLs + Lib/site-packages) ────────────────
# ANTES este script solo copiaba el código fuente a dist-python/python-runtime
# y asumía que el intérprete ya estaba ahí. Si dist-python se limpiaba (o el
# desarrollador nunca corría `npm run build:backend`), el instalador empaquetaba
# un runtime sin python.exe y la app crasheaba al arrancar con:
#   Error: spawn ...resources\python-runtime\python.exe ENOENT
#
# Estrategia:
#   - Si el runtime YA está completo e importable → refrescar SOLO el código
#     fuente (rápido, sin red). Garantiza que los cambios de python/ viajen.
#   - Si está ausente o incompleto → build_embedded.py completo (idempotente:
#     usa el zip embebido cacheado, instala pip + requirements, copia python/).
$runtimeExe = "dist-python\python-runtime\python.exe"
$runtimeW   = "dist-python\python-runtime\pythonw.exe"
$runtimeLib = "dist-python\python-runtime\Lib\site-packages"
$runtimeReady = $false
if ((Test-Path $runtimeExe) -and (Test-Path $runtimeW) -and (Test-Path $runtimeLib)) {
    & $runtimeExe -c "import fastapi, uvicorn, docx, lxml, PIL, pydantic, cryptography, networkx, openai, aiofiles, psutil" 2>$null
    if ($LASTEXITCODE -eq 0) { $runtimeReady = $true }
}

if ($runtimeReady) {
    Write-Output "=== STEP 0.5b: Runtime presente y verificado; refrescando código fuente ==="
    & python -c "import shutil, sys; from pathlib import Path; sys.path.insert(0, '$($projectDir -replace '\\', '/')/python'); from build_embedded import _ignore_fn, PYTHON_SRC, OUTPUT_DIR; src_dest = OUTPUT_DIR / 'python'; shutil.copytree(str(PYTHON_SRC), str(src_dest), ignore=_ignore_fn, dirs_exist_ok=True); payload = PYTHON_SRC / '_embedded_payload.json'; shutil.copy2(str(payload), str(src_dest / '_embedded_payload.json')) if payload.exists() else None; print('Fuente y payload sincronizados en dist-python/python-runtime/python.')"
    if ($LASTEXITCODE -ne 0) {
        Write-Output "ERROR: sincronización del código fuente al runtime falló (exit $LASTEXITCODE). Aborting installer build."
        exit 1
    }

    # ── Sincronizar DEPENDENCIAS declaradas en requirements.txt ─────────────
    # Antes esta rama solo refrescaba el código fuente y daba por hecho que el
    # runtime ya tenía TODAS las dependencias. Agregar un paquete nuevo (p.ej.
    # mcp o openpyxl) no llegaba nunca al runtime embebido y el instalador se
    # enviaba roto. pip install -r es idempotente: solo instala lo que falta.
    Write-Output "=== STEP 0.5c: Sincronizando dependencias (requirements.txt) en el runtime ==="
    & $runtimeExe -m pip install -r "$projectDir\requirements.txt" --no-warn-script-location --disable-pip-version-check
    if ($LASTEXITCODE -ne 0) {
        Write-Output "ERROR: pip install -r requirements.txt falló en el runtime embebido (exit $LASTEXITCODE). Aborting installer build."
        exit 1
    }
} else {
    Write-Output "=== STEP 0.5b: Runtime ausente/incompleto; build completo (build_embedded.py) ==="
    & python "$projectDir\python\build_embedded.py"
}
if ($LASTEXITCODE -ne 0) {
    Write-Output "ERROR: construcción/sincronización del runtime embebido falló (exit $LASTEXITCODE). Aborting installer build."
    exit 1
}

# ── Sincronizar package.json / version.json al runtime ──────────────────────
# build_embedded.py no copia estos dos archivos; la app los usa para reportar
# versión en /api/health y para el chequeo de adopción del backend.
Copy-Item "$projectDir\package.json" "dist-python\python-runtime\package.json" -Force -ErrorAction SilentlyContinue
Copy-Item "$projectDir\package.json" "dist-python\python-runtime\python\package.json" -Force -ErrorAction SilentlyContinue
if (Test-Path "$projectDir\dist\version.json") {
    Copy-Item "$projectDir\dist\version.json" "dist-python\python-runtime\version.json" -Force -ErrorAction SilentlyContinue
    Copy-Item "$projectDir\dist\version.json" "dist-python\python-runtime\python\version.json" -Force -ErrorAction SilentlyContinue
}

# ── STEP 0.6: Verificación dura del runtime (fail-closed) ───────────────────
# Si CUALQUIERA de estos archivos falta, el instalador produciría el crash
# ENOENT. Abortamos antes de empaquetar en lugar de enviar un build roto.
Write-Output "=== STEP 0.6: Verifying embedded Python runtime ==="
$pyTag = (& python -c "import sys; print(f'python{sys.version_info.major}{sys.version_info.minor}')").Trim()
$runtimeChecks = @(
    "dist-python\python-runtime\python.exe",
    "dist-python\python-runtime\pythonw.exe",
    "dist-python\python-runtime\$pyTag.dll",
    "dist-python\python-runtime\python\main.py",
    "dist-python\python-runtime\python\_embedded_payload.json",
    "dist-python\python-runtime\Lib\site-packages"
)
$runtimeMissing = @()
foreach ($p in $runtimeChecks) {
    if (-not (Test-Path $p)) { $runtimeMissing += $p }
}
if ($runtimeMissing.Count -gt 0) {
    Write-Output "ERROR: Runtime embebido INCOMPLETO. Faltan:"
    $runtimeMissing | ForEach-Object { Write-Output "  - $_" }
    Write-Output "El instalador saldría sin python.exe (crash ENOENT). Abortando."
    exit 1
}
Write-Output "Runtime verificado: python.exe + pythonw.exe + $pyTag.dll + site-packages + main.py"

# Dependencias críticas (fail-closed): si falta un paquete que el runtime debe
# traer (mcp para el servidor MCP, openpyxl para ingerir Excel), el instalador
# saldría roto. Abortamos antes de empaquetar en lugar de enviarlo.
& $runtimeExe -c "import mcp, openpyxl" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Output "ERROR: faltan dependencias críticas (mcp/openpyxl) en el runtime embebido. Abortando."
    exit 1
}
Write-Output "Dependencias críticas verificadas: mcp + openpyxl importables."

# El payload embebido puede existir pero estar vacío ({}): en ese caso el
# instalador arrancaría sin ninguna clave. Presencia no basta, hay que
# verificar que tenga contenido real.
$payloadPath = "dist-python\python-runtime\python\_embedded_payload.json"
$payloadRaw = (Get-Content $payloadPath -Raw -ErrorAction SilentlyContinue)
if ([string]::IsNullOrWhiteSpace($payloadRaw) -or $payloadRaw.Trim() -eq "{}") {
    Write-Output "ERROR: $payloadPath está vacío. Corre embed_payload.py con un .env válido. Abortando."
    exit 1
}
Write-Output "Payload embebido verificado: presente y no vacío."

Write-Output "=== STEP 1: Building unpacked app (--dir) ==="

# Step 1: Build unpacked app
$out = & cmd /c "npx electron-builder --win --dir --config electron-builder.yml 2>&1"
Write-Output $out
if ($LASTEXITCODE -ne 0) {
    Write-Output "ERROR: electron-builder --dir failed with exit code $LASTEXITCODE"
    exit 1
}

# Check if WordAPA7.exe exists (Defender might have quarantined it)
$exePath = "dist-electron-builder\win-unpacked\WordAPA7.exe"
if (-not (Test-Path $exePath)) {
    Write-Output "ERROR: WordAPA7.exe not found after --dir build! Defender may have quarantined it."
    Write-Output "=== Files in win-unpacked ==="
    Get-ChildItem dist-electron-builder\win-unpacked -ErrorAction SilentlyContinue | Select-Object Name
    exit 1
}

$exeSize = (Get-Item $exePath).Length
Write-Output "=== STEP 1 COMPLETE: WordAPA7.exe exists ($exeSize bytes) ==="

# Step 2: Immediately create 7z archive
Write-Output "=== STEP 2: Creating 7z archive ==="
# Delete existing 7z if any (con la versión correcta)
if (Test-Path $archiveFile) { Remove-Item -Force $archiveFile }

Push-Location dist-electron-builder\win-unpacked
& $sevenZip a -bd -mx=9 -md=1m -mtc=off -ms=off -mtm=off -mta=off "..\wordapa7-$appVersion-x64.nsis.7z" .
$sevenZipExit = $LASTEXITCODE
Pop-Location

if ($sevenZipExit -ne 0) {
    Write-Output "ERROR: 7za failed with exit code $sevenZipExit"
    exit 1
}

$archiveSize = (Get-Item $archiveFile).Length
Write-Output "=== STEP 2 COMPLETE: 7z archive created ($archiveSize bytes) ==="

# Step 3: Create NSIS installer using --prepackaged
Write-Output "=== STEP 3: Creating NSIS installer (--prepackaged) ==="
$out2 = & cmd /c "npx electron-builder --win --prepackaged dist-electron-builder/win-unpacked --config electron-builder.yml 2>&1"
Write-Output $out2

# Check if installer was created (con la versión correcta de package.json)
if (Test-Path $installerPath) {
    $installerSize = (Get-Item $installerPath).Length
    Write-Output "=== SUCCESS: Installer created ==="
    Write-Output "Installer: $installerPath"
    Write-Output "Size: $installerSize bytes ($([math]::Round($installerSize / 1MB, 2)) MB)"
    
    # List all output files
    Write-Output "=== Output files ==="
    Get-ChildItem dist-electron-builder -File | Select-Object Name, @{N='SizeMB';E={[math]::Round($_.Length / 1MB, 2)}} | Format-Table -AutoSize
} else {
    # Fallback: buscar cualquier *Setup*.exe por si el nombre difiere
    $fallback = Get-ChildItem dist-electron-builder -Filter "*Setup*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($fallback) {
        Write-Output "=== SUCCESS: Installer created (nombre detectado por glob) ==="
        Write-Output "Installer: $($fallback.FullName)"
        Write-Output "Size: $($fallback.Length) bytes ($([math]::Round($fallback.Length / 1MB, 2)) MB)"
        Write-Output "NOTA: el nombre no coincide con el esperado ($installerPath). Verificá electron-builder.yml / package.json."
    } else {
        Write-Output "=== FAILED: Installer not created ==="
        Write-Output "=== Files in dist-electron-builder ==="
        Get-ChildItem dist-electron-builder -File | Select-Object Name, Length | Format-Table -AutoSize
        exit 1
    }
}
