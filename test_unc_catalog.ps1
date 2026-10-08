# ============================================================================
# TEST: Trusted Catalog vía UNC Share — WordAPA7
# ============================================================================
# EJECUTAR COMO ADMINISTRADOR (net share lo requiere)
# PowerShell: clic derecho → "Ejecutar como administrador"
#
# Este script es IDEMPOTENTE: se puede correr múltiples veces sin duplicar.
# ============================================================================

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " WordAPA7 — Test Trusted Catalog UNC" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# ── 1. Variables base ───────────────────────────────────────────────────────
$computerName   = $env:COMPUTERNAME
$shareName      = "WordAPA7Addin"
$catalogDir     = Join-Path $env:APPDATA "WordAPA7\catalog"
$manifestPath   = Join-Path $catalogDir "manifest.xml"
$catalogGuid    = "{8f3a2c1d-9b4e-4a7f-8c5d-2e1f0a3b6c9d}"  # GUID fijo = <Id> del manifest

Write-Host "`n[1] Variables:" -ForegroundColor Yellow
Write-Host "  ComputerName : $computerName"
Write-Host "  ShareName    : $shareName"
Write-Host "  CatalogDir   : $catalogDir"
Write-Host "  CatalogGuid  : $catalogGuid"

# ── 2. Detectar versión de Office ───────────────────────────────────────────
# No asumir 16.0 fijo. Detectar la versión real instalada.
Write-Host "`n[2] Detectando versión de Office..." -ForegroundColor Yellow

$officeVersion = $null

# Método A: App Paths (registro que Windows usa para encontrar WINWORD.EXE)
$wordAppPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\winword.exe"
$wordExe = $null
if (Test-Path $wordAppPath) {
    $wordExe = (Get-ItemProperty $wordAppPath -ErrorAction SilentlyContinue).'(default)'
    Write-Host "  App Paths → winword.exe = $wordExe"
}

# Método B: Version del ejecutable (si encontramos la ruta)
if ($wordExe -and (Test-Path $wordExe)) {
    $fileVer = (Get-Item $wordExe).VersionInfo
    $majorVer = $fileVer.FileMajorPart
    Write-Host "  FileVersion: $($fileVer.FileVersion) (major=$majorVer)"
    if ($majorVer -ge 14) {
        $officeVersion = "$majorVer.0"
    }
}

# Método C: ClickToRun Configuration (Office 365/2019/2021)
if (-not $officeVersion) {
    $ctrPath = "HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration"
    if (Test-Path $ctrPath) {
        $ctrVer = (Get-ItemProperty $ctrPath -ErrorAction SilentlyContinue).VersionToReport
        Write-Host "  ClickToRun VersionToReport: $ctrVer"
        if ($ctrVer) {
            # ClickToRun siempre usa 16.0 como hive del registro
            $officeVersion = "16.0"
        }
    }
}

# Método D: Registry InstallRoot (Office MSI tradicional)
if (-not $officeVersion) {
    foreach ($ver in @("16.0", "15.0", "14.0")) {
        $regPath = "HKLM:\SOFTWARE\Microsoft\Office\$ver\Word\InstallRoot"
        if (Test-Path $regPath) {
            $officeVersion = $ver
            Write-Host "  InstallRoot encontrado: Office $ver"
            break
        }
    }
}

# Fallback: 16.0 (todas las versiones modernas de Office son 16.0)
if (-not $officeVersion) {
    $officeVersion = "16.0"
    Write-Host "  No se detectó versión específica, asumiendo 16.0 (Office 2016+/365)"
}

Write-Host "  → Versión de Office para registro: $officeVersion" -ForegroundColor Green

# ── 3. Crear directorio del catálogo ────────────────────────────────────────
Write-Host "`n[3] Creando directorio del catálogo..." -ForegroundColor Yellow
if (-not (Test-Path $catalogDir)) {
    New-Item -ItemType Directory -Path $catalogDir -Force | Out-Null
    Write-Host "  Directorio creado: $catalogDir"
} else {
    Write-Host "  Directorio ya existe: $catalogDir"
}

# ── 4. Buscar y copiar el manifest.xml ──────────────────────────────────────
Write-Host "`n[4] Buscando manifest.xml..." -ForegroundColor Yellow

# Buscar el manifest en varias ubicaciones (prioridad: storage > dist > public > raíz)
$manifestCandidates = @(
    (Join-Path $env:APPDATA "WordAPA7\storage\manifest.xml"),
    (Join-Path $PSScriptRoot "word-addin\dist\manifest.xml"),
    (Join-Path $PSScriptRoot "word-addin\public\manifest.xml"),
    (Join-Path $PSScriptRoot "word-addin\manifest.xml")
)

$sourceManifest = $null
foreach ($candidate in $manifestCandidates) {
    if (Test-Path $candidate) {
        $sourceManifest = $candidate
        Write-Host "  Encontrado: $candidate"
        break
    }
}

if (-not $sourceManifest) {
    Write-Host "  ERROR: No se encontró manifest.xml en ninguna ubicación." -ForegroundColor Red
    Write-Host "  Ejecuta start.bat primero para que el backend genere el manifest."
    exit 1
}

# ── 5. Crear manifest MODIFICADO con SourceLocation UNC ─────────────────────
# CRÍTICO: el manifest original tiene SourceLocation = https://localhost:8742/...
# Para que el UNC funcione SIN certificado, hay que cambiar el SourceLocation
# a una ruta local/UNC. Pero WebView2 puede no cargar JS desde file://.
#
# ESTRATEGIA: crear DOS manifiestos para probar ambos enfoques:
#   A) manifest-https.xml → SourceLocation = https://localhost:8742/... (con cert)
#   B) manifest-unc.xml   → SourceLocation = \\PC\share\taskpane.html (sin cert)

Write-Host "`n[5] Generando manifiestos de prueba..." -ForegroundColor Yellow

# Leer el manifest original
$xmlContent = Get-Content $sourceManifest -Raw -Encoding UTF8

# La ruta UNC base
$uncBase = "\\$computerName\$shareName"

# ── Manifest A: SourceLocation HTTPS (el original, para comparar) ──
$manifestHttps = $xmlContent -replace 'https://localhost:8742/addin', 'https://localhost:8742/addin'
$httpsPath = Join-Path $catalogDir "manifest-https.xml"
$manifestHttps | Set-Content $httpsPath -Encoding UTF8 -NoNewline
Write-Host "  [A] manifest-https.xml → SourceLocation = https://localhost:8742/addin/"

# ── Manifest B: SourceLocation UNC (sin HTTPS, sin certificado) ──
# Reemplazar todas las URLs HTTPS por rutas UNC
$manifestUnc = $xmlContent
$manifestUnc = $manifestUnc -replace 'https://localhost:8742/addin', $uncBase
$manifestUnc = $manifestUnc -replace 'https://localhost:8742', $uncBase
$manifestUnc = $manifestUnc -replace 'https://127\.0\.0\.1:8742/addin', $uncBase
$manifestUnc = $manifestUnc -replace 'https://127\.0\.0\.1:8742', $uncBase
$uncPath = Join-Path $catalogDir "manifest-unc.xml"
$manifestUnc | Set-Content $uncPath -Encoding UTF8 -NoNewline
Write-Host "  [B] manifest-unc.xml   → SourceLocation = $uncBase/"

# ── Copiar también los archivos del add-in (HTML, JS, CSS, iconos) al share ──
# Para que el manifest-unc.xml funcione, los archivos taskpane.html, commands.html,
# assets/, etc. deben estar físicamente en el share.
$addinDistDir = $null
$addinCandidates = @(
    (Join-Path $PSScriptRoot "word-addin\dist"),
    (Join-Path $PSScriptRoot "dist\addin")
)
foreach ($c in $addinCandidates) {
    if (Test-Path (Join-Path $c "taskpane.html")) {
        $addinDistDir = $c
        break
    }
}

if ($addinDistDir) {
    Write-Host "`n  Copiando archivos del add-in desde: $addinDistDir" -ForegroundColor Gray
    Copy-Item -Path "$addinDistDir\*" -Destination $catalogDir -Recurse -Force
    Write-Host "  Archivos copiados al catálogo." -ForegroundColor Green
} else {
    Write-Host "`n  ADVERTENCIA: No se encontró word-addin/dist/." -ForegroundColor Red
    Write-Host "  Ejecuta 'npm run build:addin' para construir el add-in." -ForegroundColor Red
}

# Por defecto usamos el manifest-unc.xml como manifest.xml del catálogo
Copy-Item $uncPath $manifestPath -Force
Write-Host "`n  manifest.xml activo = manifest-unc.xml (SourceLocation UNC)" -ForegroundColor Green
Write-Host "  (Para probar con HTTPS, copia manifest-https.xml sobre manifest.xml)"

# ── 6. Crear share de red (REQUIERE ADMIN) ──────────────────────────────────
Write-Host "`n[6] Creando share de red..." -ForegroundColor Yellow

# Verificar si el share ya existe
$existingShare = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue

if ($existingShare) {
    Write-Host "  Share '$shareName' ya existe. Verificando ruta..." -ForegroundColor Gray
    if ($existingShare.Path -ne $catalogDir) {
        Write-Host "  La ruta del share cambió. Actualizando..." -ForegroundColor Yellow
        Remove-SmbShare -Name $shareName -Force
        New-SmbShare -Name $shareName -Path $catalogDir -ReadAccess $env:USERNAME -Description "WordAPA7 Add-in Catalog" | Out-Null
        Write-Host "  Share actualizado." -ForegroundColor Green
    } else {
        Write-Host "  Share OK (ruta coincide)." -ForegroundColor Green
    }
} else {
    try {
        New-SmbShare -Name $shareName -Path $catalogDir -ReadAccess $env:USERNAME -Description "WordAPA7 Add-in Catalog" -ErrorAction Stop | Out-Null
        Write-Host "  Share creado: $uncBase" -ForegroundColor Green
    } catch {
        Write-Host "  New-SmbShare falló, intentando con net share..." -ForegroundColor Yellow
        $result = & net share $shareName=$catalogDir "/GRANT:$($env:USERNAME),READ" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Share creado via net share: $uncBase" -ForegroundColor Green
        } else {
            Write-Host "  ERROR: No se pudo crear el share." -ForegroundColor Red
            Write-Host "  $result"
            Write-Host "`n  ¿Estás ejecutando PowerShell como Administrador?" -ForegroundColor Red
            exit 1
        }
    }
}

# Verificar que el share es accesible
Start-Sleep -Seconds 1
$uncTest = "\\$computerName\$shareName"
if (Test-Path $uncTest) {
    Write-Host "  Share accesible: $uncTest" -ForegroundColor Green
    $testFile = Join-Path $uncTest "manifest.xml"
    if (Test-Path $testFile) {
        Write-Host "  manifest.xml accesible via UNC." -ForegroundColor Green
    } else {
        Write-Host "  ADVERTENCIA: manifest.xml no encontrado via UNC." -ForegroundColor Yellow
    }
} else {
    Write-Host "  ADVERTENCIA: No se puede acceder al share via UNC." -ForegroundColor Yellow
    Write-Host "  Probando con localhost..." -ForegroundColor Gray
    if (Test-Path "\\localhost\$shareName") {
        Write-Host "  Share accesible via \\localhost\$shareName" -ForegroundColor Green
        $uncTest = "\\localhost\$shareName"
    }
}

# ── 7. Registrar Trusted Catalog en el registro ─────────────────────────────
Write-Host "`n[7] Registrando Trusted Catalog en el registro..." -ForegroundColor Yellow

$regBase = "HKCU:\Software\Microsoft\Office\$officeVersion\WEF\TrustedCatalogs"
$regKey = "$regBase\$catalogGuid"

# Crear la clave base si no existe
if (-not (Test-Path $regBase)) {
    New-Item -Path $regBase -Force | Out-Null
}

# Crear/actualizar la clave del catálogo
New-Item -Path $regKey -Force | Out-Null

# Url: ruta UNC del catálogo
Set-ItemProperty -Path $regKey -Name "Url" -Value $uncTest -Type String
# Flags: 1 = mostrar en el menú de complementos
Set-ItemProperty -Path $regKey -Name "Flags" -Value 1 -Type DWord
# Id: el GUID del catálogo (debe coincidir con el del manifest)
Set-IdValue = $catalogGuid
Set-ItemProperty -Path $regKey -Name "Id" -Value $catalogGuid -Type String

Write-Host "  Registro escrito:" -ForegroundColor Green
Write-Host "    Clave: $regKey"
Write-Host "    Url   = $uncTest"
Write-Host "    Flags = 1"
Write-Host "    Id    = $catalogGuid"

# ── 8. Limpiar el registro Developer sideload anterior (si existe) ──────────
Write-Host "`n[8] Limpiando registro Developer sideload anterior..." -ForegroundColor Yellow
$devKey = "HKCU:\Software\Microsoft\Office\$officeVersion\Wef\Developer"
try {
    $devValue = (Get-ItemProperty -Path $devKey -Name "WordAPA7" -ErrorAction SilentlyContinue).WordAPA7
    if ($devValue) {
        Remove-ItemProperty -Path $devKey -Name "WordAPA7" -ErrorAction SilentlyContinue
        Write-Host "  Eliminado: $devKey\WordAPA7 = $devValue" -ForegroundColor Green
    } else {
        Write-Host "  No había registro Developer sideload previo." -ForegroundColor Gray
    }
} catch {
    Write-Host "  No había registro Developer sideload previo." -ForegroundColor Gray
}

# ── 9. Resumen y instrucciones ──────────────────────────────────────────────
Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host " CONFIGURACIÓN COMPLETADA" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host @"
Para probar en Word:

  1. Cierra TODAS las ventanas de Word.
  2. Abre Word.
  3. Ve a: Insertar → Mis complementos → Carpeta compartida
  4. Deberías ver "WordAPA7" ahí.
  5. Haz clic en "Agregar" para insertarlo.

Si NO aparece en "Carpeta compartida":
  - Archivo → Opciones → Centro de confianza → Configuración del
    Centro de confianza → Catálogos de complementos
  - Verifica que la URL del catálogo sea: $uncTest
  - Si no está ahí, agrégala manualmente y marca "Mostrar en el menú"

PARA PROBAR CON HTTPS (manifest-https.xml):
  Copy-Item "$catalogDir\manifest-https.xml" "$manifestPath" -Force

PARA VOLVER A MODO DEVELOPER SIDeload:
  PowerShell .\register_addin.ps1

PARA DESHACER TODO:
  net share $shareName /delete
  Remove-Item "$regKey" -Recurse -Force
  Remove-Item "$catalogDir" -Recurse -Force
"@

Write-Host "`nNOTA: Si el add-in aparece pero el panel está en blanco," -ForegroundColor Yellow
Write-Host "significa que WebView2 no puede cargar los archivos desde la ruta UNC." -ForegroundColor Yellow
Write-Host "En ese caso, prueba con manifest-https.xml (necesita certificado SSL)." -ForegroundColor Yellow
Write-Host ""
