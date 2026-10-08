# ============================================================================
# test_trusted_catalog.ps1 - Probar Trusted Catalog para WordAPA7
# ============================================================================
# USO:
#   powershell -ExecutionPolicy Bypass -File test_trusted_catalog.ps1
#   powershell -ExecutionPolicy Bypass -File test_trusted_catalog.ps1 -UseUNC
#   powershell -ExecutionPolicy Bypass -File test_trusted_catalog.ps1 -Cleanup
# ============================================================================

param(
    [switch]$UseUNC = $false,
    [switch]$Cleanup = $false
)

$ErrorActionPreference = "Continue"

# Constantes fijas (coinciden con el Id del manifest.xml)
$addinId     = "8f3a2c1d-9b4e-4a7f-8c5d-2e1f0a3b6c9d"
$catalogGuid = "{$addinId}"
$shareName   = "WordAPA7Catalog"

# Rutas
$appdata       = $env:APPDATA
if (-not $appdata) { $appdata = Join-Path $env:USERPROFILE "AppData\Roaming" }
$catalogDir    = Join-Path $appdata "WordAPA7\catalog"
$catalogManifest = Join-Path $catalogDir "manifest.xml"

# Buscar manifest fuente
$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = (Get-Location).Path }

$manifestCandidates = @(
    (Join-Path $scriptDir "word-addin\manifest.xml"),
    (Join-Path $scriptDir "word-addin\dist\manifest.xml"),
    (Join-Path $appdata "WordAPA7\storage\manifest.xml"),
    (Join-Path $scriptDir "dist-electron-builder\win-unpacked\resources\addin\manifest.xml")
)
$manifestSrc = $null
foreach ($c in $manifestCandidates) {
    if (Test-Path $c) { $manifestSrc = $c; break }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  WordAPA7 - Trusted Catalog Test Script" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# MODO CLEANUP
# ============================================================================
if ($Cleanup) {
    Write-Host "[CLEANUP] Eliminando Trusted Catalog y share..." -ForegroundColor Yellow

    $officeBase = "HKCU:\Software\Microsoft\Office"
    if (Test-Path $officeBase) {
        Get-ChildItem $officeBase -ErrorAction SilentlyContinue | ForEach-Object {
            $ver = $_.PSChildName
            if ($ver -match '^\d+\.\d+$') {
                $catKey = "HKCU:\Software\Microsoft\Office\$ver\WEF\TrustedCatalogs\$catalogGuid"
                if (Test-Path $catKey) {
                    Remove-Item $catKey -Recurse -Force -ErrorAction SilentlyContinue
                    Write-Host "  Eliminado: $catKey" -ForegroundColor Green
                }
            }
        }
    }

    # Eliminar share si existe
    try {
        $s = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
        if ($s) {
            Remove-SmbShare -Name $shareName -Force -ErrorAction SilentlyContinue
            Write-Host "  Share eliminado: $shareName" -ForegroundColor Green
        } else {
            Write-Host "  Share no existe (nada que limpiar)." -ForegroundColor Gray
        }
    } catch {
        $netResult = net share $shareName 2>$null
        if ($LASTEXITCODE -eq 0) {
            net share $shareName /DELETE 2>$null
            Write-Host "  Share eliminado via net share." -ForegroundColor Green
        } else {
            Write-Host "  Share no existe." -ForegroundColor Gray
        }
    }

    # Eliminar sideload de desarrollador
    $devKey = "HKCU:\Software\Microsoft\Office\16.0\Wef\Developer"
    try {
        $devVal = (Get-ItemProperty -Path $devKey -Name "WordAPA7" -ErrorAction SilentlyContinue)."WordAPA7"
        if ($devVal) {
            Remove-ItemProperty -Path $devKey -Name "WordAPA7" -ErrorAction SilentlyContinue
            Write-Host "  Sideload de desarrollador eliminado." -ForegroundColor Green
        }
    } catch {}

    Write-Host ""
    Write-Host "[CLEANUP] Listo. Cierre Word y vuelva a abrirlo." -ForegroundColor Green
    exit 0
}

# ============================================================================
# DIAGNOSTICO: estado actual
# ============================================================================
Write-Host "=== DIAGNOSTICO DEL ESTADO ACTUAL ===" -ForegroundColor Yellow
Write-Host ""

# 1. Version de Office instalada
Write-Host "--- Version de Office instalada ---" -ForegroundColor Gray

function Get-OfficeVersion {
    $foundVersions = @()
    $regPaths = @(
        "HKLM:\SOFTWARE\Microsoft\Office",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office"
    )
    foreach ($base in $regPaths) {
        if (-not (Test-Path $base)) { continue }
        Get-ChildItem $base -ErrorAction SilentlyContinue | ForEach-Object {
            $ver = $_.PSChildName
            if ($ver -match '^\d+\.\d+$') {
                $wordInstallRoot = Join-Path $base "$ver\Word\InstallRoot"
                if (Test-Path $wordInstallRoot) {
                    $path = (Get-ItemProperty $wordInstallRoot -ErrorAction SilentlyContinue).Path
                    if ($path) {
                        $hiveLabel = "HKLM"
                        if ($base -match "WOW6432Node") { $hiveLabel = "HKLM\WOW6432Node" }
                        $foundVersions += [PSCustomObject]@{
                            Version = $ver
                            Path    = $path
                            Hive    = $hiveLabel
                        }
                    }
                }
            }
        }
    }

    # Fallback: App Paths
    if ($foundVersions.Count -eq 0) {
        $appPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Winword.exe"
        if (Test-Path $appPath) {
            $exePath = (Get-ItemProperty $appPath -ErrorAction SilentlyContinue).'(default)'
            if ($exePath -and (Test-Path $exePath)) {
                $vi = (Get-Item $exePath).VersionInfo
                $majorMinor = "$($vi.ProductMajorPart).$($vi.ProductMinorPart)"
                $foundVersions += [PSCustomObject]@{
                    Version = $majorMinor
                    Path    = $exePath
                    Hive    = "App Paths (fallback)"
                }
            }
        }
    }
    return $foundVersions
}

$officeVersions = Get-OfficeVersion
if ($officeVersions.Count -gt 0) {
    foreach ($ov in $officeVersions) {
        Write-Host "  Version: $($ov.Version)  |  Hive: $($ov.Hive)" -ForegroundColor Green
        Write-Host "  Path: $($ov.Path)" -ForegroundColor Gray
    }
} else {
    Write-Host "  No se detecto Office instalado." -ForegroundColor Red
}
Write-Host ""

# 2. Sideload de desarrollador actual
Write-Host "--- Sideload de desarrollador actual (Wef\Developer) ---" -ForegroundColor Gray
$devKeyBase = "HKCU:\Software\Microsoft\Office\16.0\Wef\Developer"
try {
    if (Test-Path $devKeyBase) {
        $devProps = Get-ItemProperty -Path $devKeyBase -ErrorAction SilentlyContinue
        if ($devProps) {
            $foundAny = $false
            $devProps.PSObject.Properties | Where-Object { $_.Name -notlike "PS*" } | ForEach-Object {
                $foundAny = $true
                $val = $_.Value
                $exists = "MISSING!"
                if ($val -and (Test-Path $val)) { $exists = "EXISTS" }
                $color = "Green"
                if ($exists -ne "EXISTS") { $color = "Red" }
                Write-Host "  $($_.Name) = $val  [$exists]" -ForegroundColor $color
            }
            if (-not $foundAny) {
                Write-Host "  (clave existe pero sin valores)" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "  La clave no existe." -ForegroundColor Yellow
    }
} catch {
    Write-Host "  Error leyendo la clave: $_" -ForegroundColor Red
}
Write-Host ""

# 3. Trusted Catalogs existentes
Write-Host "--- Trusted Catalogs existentes ---" -ForegroundColor Gray
foreach ($ov in $officeVersions) {
    $ver = $ov.Version
    $tcBase = "HKCU:\Software\Microsoft\Office\$ver\WEF\TrustedCatalogs"
    if (Test-Path $tcBase) {
        $catalogs = Get-ChildItem $tcBase -ErrorAction SilentlyContinue
        if ($catalogs) {
            foreach ($cat in $catalogs) {
                $catProps = Get-ItemProperty $cat.PSPath -ErrorAction SilentlyContinue
                $url = $catProps.Url
                $flags = $catProps.Flags
                Write-Host "  [$ver] $($cat.PSChildName) -> Url=$url Flags=$flags" -ForegroundColor Cyan
            }
        } else {
            Write-Host "  [$ver] Clave existe pero sin catalogos." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [$ver] No hay Trusted Catalogs registrados." -ForegroundColor Yellow
    }
}
Write-Host ""

# 4. Manifest
Write-Host "--- Manifest.xml ---" -ForegroundColor Gray
if ($manifestSrc) {
    Write-Host "  Fuente: $manifestSrc" -ForegroundColor Green
    try {
        $xml = [xml](Get-Content $manifestSrc -Encoding UTF8 -ErrorAction SilentlyContinue)
        $idNode = $xml.OfficeApp.Id
        $sourceLoc = $xml.OfficeApp.DefaultSettings.SourceLocation.DefaultValue
        Write-Host "  Id: $idNode" -ForegroundColor Cyan
        Write-Host "  SourceLocation: $sourceLoc" -ForegroundColor Cyan
    } catch {
        Write-Host "  ERROR parseando XML: $_" -ForegroundColor Red
    }
} else {
    Write-Host "  No se encontro manifest.xml." -ForegroundColor Red
}
Write-Host ""

# 5. Backend
Write-Host "--- Backend (localhost:8742) ---" -ForegroundColor Gray
$backendUp = $false
try {
    $response = Invoke-WebRequest -Uri "https://localhost:8742/api/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        $backendUp = $true
        Write-Host "  Backend: CORRIENDO (HTTPS)" -ForegroundColor Green
    }
} catch {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8742/api/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $backendUp = $true
            Write-Host "  Backend: CORRIENDO (HTTP)" -ForegroundColor Green
        }
    } catch {
        Write-Host "  Backend: NO RESPONDE" -ForegroundColor Red
        Write-Host "  (Abre la app WordAPA7 para que arranque el backend)" -ForegroundColor Gray
    }
}
Write-Host ""

# ============================================================================
# PREPARAR MANIFEST EN DIRECTORIO DE CATALOGO
# ============================================================================
Write-Host "=== PREPARANDO CATALOGO ===" -ForegroundColor Yellow

if (-not (Test-Path $catalogDir)) {
    New-Item -ItemType Directory -Path $catalogDir -Force | Out-Null
    Write-Host "  Directorio creado: $catalogDir"
}

if ($manifestSrc) {
    Copy-Item -Path $manifestSrc -Destination $catalogManifest -Force
    Write-Host "  Manifest copiado a: $catalogManifest" -ForegroundColor Green
} else {
    Write-Host "  ERROR: No hay manifest para copiar." -ForegroundColor Red
    exit 1
}

Write-Host ""

# ============================================================================
# OPCION A: Trusted Catalog con RUTA LOCAL (sin admin)
# ============================================================================
if (-not $UseUNC) {
    Write-Host "=== OPCION A: Trusted Catalog con ruta local (SIN admin) ===" -ForegroundColor Yellow
    Write-Host "  Ruta: $catalogDir" -ForegroundColor Gray

    foreach ($ov in $officeVersions) {
        $ver = $ov.Version
        $tcBase = "HKCU:\Software\Microsoft\Office\$ver\WEF\TrustedCatalogs"
        $tcKey = "$tcBase\$catalogGuid"

        if (-not (Test-Path $tcBase)) { New-Item -Path $tcBase -Force | Out-Null }
        if (-not (Test-Path $tcKey)) { New-Item -Path $tcKey -Force | Out-Null }

        Set-ItemProperty -Path $tcKey -Name "Url" -Value $catalogDir -Type String -Force
        Set-ItemProperty -Path $tcKey -Name "Flags" -Value 1 -Type DWord -Force
        Set-ItemProperty -Path $tcKey -Name "Id" -Value $catalogGuid -Type String -Force

        Write-Host "  [$ver] Registrado:" -ForegroundColor Green
        Write-Host "       Url = $catalogDir" -ForegroundColor Gray
        Write-Host "       Flags = 1" -ForegroundColor Gray
    }

    Write-Host ""
    Write-Host "  NOTA: Office documentadamente solo acepta UNC o HTTPS." -ForegroundColor Yellow
    Write-Host "  Las rutas locales C:\ no estan soportadas oficialmente." -ForegroundColor Yellow
    Write-Host "  Si no funciona, proba la Opcion B (UNC share):" -ForegroundColor Yellow
    Write-Host "    powershell -ExecutionPolicy Bypass -File test_trusted_catalog.ps1 -UseUNC" -ForegroundColor White
}

# ============================================================================
# OPCION B: Trusted Catalog con UNC SHARE (requiere admin una vez)
# ============================================================================
if ($UseUNC) {
    Write-Host "=== OPCION B: Trusted Catalog con UNC share (requiere admin) ===" -ForegroundColor Yellow

    $computerName = $env:COMPUTERNAME
    $uncPath = "\\$computerName\$shareName"

    Write-Host "  Computadora: $computerName" -ForegroundColor Gray
    Write-Host "  UNC:         $uncPath" -ForegroundColor Gray
    Write-Host "  Carpeta:     $catalogDir" -ForegroundColor Gray
    Write-Host ""

    # Verificar si el share ya existe
    $shareExists = $false
    try {
        $s = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
        if ($s) { $shareExists = $true; Write-Host "  El share ya existe." -ForegroundColor Green }
    } catch {
        $netResult = net share $shareName 2>$null
        if ($LASTEXITCODE -eq 0 -and $netResult) { $shareExists = $true; Write-Host "  El share ya existe." -ForegroundColor Green }
    }

    # Crear el share si no existe
    if (-not $shareExists) {
        Write-Host "  Creando share '$shareName'..." -ForegroundColor Gray

        $smbAvailable = $null -ne (Get-Command New-SmbShare -ErrorAction SilentlyContinue)

        if ($smbAvailable) {
            try {
                New-SmbShare -Name $shareName -Path $catalogDir -ReadAccess $env:USERNAME -Description "WordAPA7 Add-in Catalog" -ErrorAction Stop | Out-Null
                Write-Host "  Share creado via New-SmbShare (solo $env:USERNAME, lectura)." -ForegroundColor Green
            } catch {
                Write-Host "  New-SmbShare fallo: $_" -ForegroundColor Yellow
                Write-Host "  Intentando con net share..." -ForegroundColor Gray
                $netResult = net share "$shareName=$catalogDir" /GRANT:"$env:USERNAME,READ" 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  Share creado via net share." -ForegroundColor Green
                } else {
                    Write-Host "  ERROR: No se pudo crear el share." -ForegroundColor Red
                    Write-Host "  Ejecuta como administrador." -ForegroundColor Red
                }
            }
        } else {
            $netResult = net share "$shareName=$catalogDir" /GRANT:"$env:USERNAME,READ" 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  Share creado via net share." -ForegroundColor Green
            } else {
                Write-Host "  ERROR: net share fallo (codigo $LASTEXITCODE)." -ForegroundColor Red
            }
        }
    }

    # Registrar el Trusted Catalog con la ruta UNC
    Write-Host ""
    Write-Host "  Registrando Trusted Catalog con UNC..." -ForegroundColor Gray

    foreach ($ov in $officeVersions) {
        $ver = $ov.Version
        $tcBase = "HKCU:\Software\Microsoft\Office\$ver\WEF\TrustedCatalogs"
        $tcKey = "$tcBase\$catalogGuid"

        if (-not (Test-Path $tcBase)) { New-Item -Path $tcBase -Force | Out-Null }
        if (-not (Test-Path $tcKey)) { New-Item -Path $tcKey -Force | Out-Null }

        Set-ItemProperty -Path $tcKey -Name "Url" -Value $uncPath -Type String -Force
        Set-ItemProperty -Path $tcKey -Name "Flags" -Value 1 -Type DWord -Force
        Set-ItemProperty -Path $tcKey -Name "Id" -Value $catalogGuid -Type String -Force

        Write-Host "  [$ver] Registrado:" -ForegroundColor Green
        Write-Host "       Url = $uncPath" -ForegroundColor Gray
        Write-Host "       Flags = 1" -ForegroundColor Gray
    }
}

# ============================================================================
# VERIFICACION FINAL
# ============================================================================
Write-Host ""
Write-Host "=== VERIFICACION ===" -ForegroundColor Yellow

if ($UseUNC) {
    $uncPath = "\\$env:COMPUTERNAME\$shareName"
    Write-Host "  Acceso UNC: $uncPath" -ForegroundColor Gray
    if (Test-Path $uncPath) {
        $files = Get-ChildItem $uncPath -Filter "*.xml" -ErrorAction SilentlyContinue
        if ($files) {
            Write-Host "  OK - Manifest accesible via UNC." -ForegroundColor Green
        } else {
            Write-Host "  WARNING - Se accede al share pero no hay XML dentro." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ERROR - No se puede acceder al UNC." -ForegroundColor Red
    }
}

Write-Host "  Manifest local: $catalogManifest" -ForegroundColor Gray
if (Test-Path $catalogManifest) {
    $size = (Get-Item $catalogManifest).Length
    Write-Host "  OK - Manifest presente ($size bytes)." -ForegroundColor Green
} else {
    Write-Host "  ERROR - Manifest no encontrado." -ForegroundColor Red
}

foreach ($ov in $officeVersions) {
    $ver = $ov.Version
    $tcKey = "HKCU:\Software\Microsoft\Office\$ver\WEF\TrustedCatalogs\$catalogGuid"
    if (Test-Path $tcKey) {
        $props = Get-ItemProperty $tcKey
        Write-Host "  [$ver] Registro OK: Url=$($props.Url) Flags=$($props.Flags)" -ForegroundColor Green
    } else {
        Write-Host "  [$ver] Registro NO encontrado." -ForegroundColor Red
    }
}

# ============================================================================
# INSTRUCCIONES
# ============================================================================
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  QUE HACER AHORA" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. CIERRE Word completamente (todas las ventanas)." -ForegroundColor White
Write-Host ""
Write-Host "2. Abra Word de nuevo." -ForegroundColor White
Write-Host ""
Write-Host "3. Insertar > Mis complementos (u 'Obtener complementos')." -ForegroundColor White
Write-Host ""
Write-Host "4. Busque la pestania 'CARPETA COMPARTIDA' o 'SHARED FOLDER'." -ForegroundColor White
Write-Host ""
Write-Host "5. Si funciona, vera 'WordAPA7' ahi. Haga clic en 'Agregar'." -ForegroundColor White
Write-Host ""
Write-Host "6. La pestania 'WordAPA7' deberia aparecer en el ribbon." -ForegroundColor White
Write-Host ""
Write-Host "--- Si NO aparece ---" -ForegroundColor Yellow
Write-Host "   a) Verifique que Word este cerrado y vuelva a abrirlo" -ForegroundColor Gray
Write-Host "   b) El backend debe estar corriendo (abra la app WordAPA7)" -ForegroundColor Gray
Write-Host "   c) Pruebe la Opcion B (UNC share):" -ForegroundColor Gray
Write-Host "      powershell -ExecutionPolicy Bypass -File test_trusted_catalog.ps1 -UseUNC" -ForegroundColor White
Write-Host ""
Write-Host "--- Para deshacer todo ---" -ForegroundColor Yellow
Write-Host "   powershell -ExecutionPolicy Bypass -File test_trusted_catalog.ps1 -Cleanup" -ForegroundColor Gray
Write-Host ""
