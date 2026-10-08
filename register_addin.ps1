$ErrorActionPreference = "Stop"
<#
.SYNOPSIS
    Registra el complemento WordAPA7 en Microsoft Word (sideload de desarrollador).

.DESCRIPTION
    Este script registra el manifiesto XML del Add-in de WordAPA7 para que
    Word lo cargue automáticamente en la barra superior (ribbon).

    Estrategia:
    1. Busca el manifiesto generado dinámicamente en STORAGE_DIR (con URLs HTTPS
       correctas). Si no existe, busca el manifest.xml del proyecto.
    2. Lo registra en la clave de registro de Office para desarrolladores:
         HKCU\Software\Microsoft\Office\16.0\Wef\Developer\WordAPA7
    3. También copia el manifiesto a una carpeta de catálogo compartido para
       que aparezca en Insertar > Mis complementos > Carpeta compartida.

    REQUISITOS:
    - El backend de WordAPA7 debe estar corriendo (start.bat) para que el
      manifiesto con URLs HTTPS se genere en STORAGE_DIR.
    - Si el backend no está corriendo, el script usa el manifest.xml del
      proyecto y registra igual (las URLs se resolverán cuando el backend inicie).

    DESPUÉS DE EJECUTAR:
    - Reinicia Microsoft Word completamente (cierra todas las ventanas).
    - La pestaña "WordAPA7" debería aparecer en la barra superior (ribbon).
    - Si no aparece: Insertar > Mis complementos > Complementos de desarrollador.
#>

try {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

    # ── 1. Buscar el manifiesto ──────────────────────────────────────────
    # Prioridad:
    #   a) STORAGE_DIR/manifest.xml (generado por el backend con URLs HTTPS)
    #   b) word-addin/dist/manifest.xml (build del add-in)
    #   c) word-addin/public/manifest.xml (fuente)
    #   d) word-addin/manifest.xml (fuente alternativa)

    $candidates = @()

    # a) STORAGE_DIR — donde el backend escribe el manifest con URLs reales
    $appdata = $env:APPDATA
    if (-not $appdata) { $appdata = Join-Path $env:USERPROFILE "AppData\Roaming" }
    $storageManifest = Join-Path $appdata "WordAPA7\storage\manifest.xml"
    if (Test-Path $storageManifest) {
        $candidates += $storageManifest
        Write-Host "[INFO] Manifiesto encontrado en STORAGE_DIR: $storageManifest"
    }

    # b) dist del add-in
    $distManifest = Join-Path $scriptDir "word-addin\dist\manifest.xml"
    if (Test-Path $distManifest) {
        $candidates += $distManifest
        Write-Host "[INFO] Manifiesto encontrado en dist: $distManifest"
    }

    # c) public del add-in
    $publicManifest = Join-Path $scriptDir "word-addin\public\manifest.xml"
    if (Test-Path $publicManifest) {
        $candidates += $publicManifest
        Write-Host "[INFO] Manifiesto encontrado en public: $publicManifest"
    }

    # d) raíz del add-in
    $addinManifest = Join-Path $scriptDir "word-addin\manifest.xml"
    if (Test-Path $addinManifest) {
        $candidates += $addinManifest
        Write-Host "[INFO] Manifiesto encontrado en word-addin: $addinManifest"
    }

    if ($candidates.Count -eq 0) {
        Write-Host "[ERROR] No se encontro ningun manifest.xml."
        Write-Host "        Ejecuta start.bat primero para que el backend genere el manifiesto."
        exit 1
    }

    # Usar el primer candidato (prioridad: STORAGE_DIR > dist > public > raiz)
    $manifestPath = $candidates[0]
    Write-Host "[OK] Usando manifiesto: $manifestPath"

    # ── 2. Registrar en la clave de Office para desarrolladores ──────────
    # Esta clave hace que Word cargue el Add-in automáticamente al iniciar.
    # No requiere permisos de administrador (usa HKCU).
    $devKey = "HKCU:\Software\Microsoft\Office\16.0\Wef\Developer"
    if (!(Test-Path $devKey)) { New-Item -Path $devKey -Force | Out-Null }

    # Limpiar registros anteriores de WordAPA7
    try {
        $existing = Get-Item -Path $devKey -ErrorAction SilentlyContinue
        if ($existing) {
            $existing.Property | ForEach-Object {
                if ($_ -match "WordAPA7") {
                    Remove-ItemProperty -Path $devKey -Name $_ -ErrorAction SilentlyContinue
                }
            }
        }
    } catch { }

    # Registrar el manifiesto
    $id = "WordAPA7"
    Set-ItemProperty -Path $devKey -Name $id -Value $manifestPath -Type String
    Write-Host "[OK] Complemento registrado en modo Desarrollador (registry sideload)."
    Write-Host "     Clave: $devKey\$id"
    Write-Host "     Ruta:  $manifestPath"

    # ── 3. Copiar a carpeta de catálogo compartido (fallback) ────────────
    # Si el registro WEF no funciona en alguna configuración de Word,
    # el usuario puede agregar esta carpeta como "Catálogo de complementos
    # de confianza" en Centro de confianza > Catálogos de complementos.
    $catalogDir = Join-Path $appdata "WordAPA7\catalog"
    if (!(Test-Path $catalogDir)) { New-Item -ItemType Directory -Path $catalogDir -Force | Out-Null }
    $catalogManifest = Join-Path $catalogDir "manifest.xml"
    Copy-Item -Path $manifestPath -Destination $catalogManifest -Force
    Write-Host "[OK] Manifiesto copiado a catálogo compartido: $catalogManifest"
    Write-Host "     Para usar catálogo: Word > Archivo > Opciones > Centro de confianza >"
    Write-Host "     Configuración del Centro de confianza > Catálogos de complementos >"
    Write-Host "     URL del catálogo: $catalogDir"

    # ── 4. Instrucciones ────────────────────────────────────────────────
    Write-Host ""
    Write-Host "============================================================"
    Write-Host "  COMPLEMENTO REGISTRADO CORRECTAMENTE"
    Write-Host "============================================================"
    Write-Host ""
    Write-Host "  IMPORTANTE: Reinicia Microsoft Word completamente."
    Write-Host "  Cierra TODAS las ventanas de Word y vuelve a abrirlo."
    Write-Host ""
    Write-Host "  La pestaña 'WordAPA7' deberia aparecer en la barra superior."
    Write-Host ""
    Write-Host "  Si no aparece:"
    Write-Host "    1. Asegurate de que el backend este corriendo (start.bat)"
    Write-Host "    2. Ve a Insertar > Mis complementos > Complementos de desarrollador"
    Write-Host "    3. Selecciona 'WordAPA7' y haz clic en Agregar"
    Write-Host ""
    Write-Host "  Alternativa (catálogo compartido):"
    Write-Host "    Archivo > Opciones > Centro de confianza > Configuración del"
    Write-Host "    Centro de confianza > Catálogos de complementos >"
    Write-Host "    Agregar: $catalogDir"
    Write-Host "    Abrir Word > Insertar > Mis complementos > Carpeta compartida"
    Write-Host "============================================================"

} catch {
    Write-Host "[ERROR] No se pudo registrar el complemento."
    Write-Host $_.Exception.Message
    exit 1
}
