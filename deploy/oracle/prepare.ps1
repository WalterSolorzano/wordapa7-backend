# WordAPA7 — Preparar la carpeta de despliegue para Oracle Cloud
#
# Ensambla deploy/oracle/space/ con todo lo que necesita el docker-compose:
#   - dist/            frontend compilado (npm run build)
#   - python/          backend (filtra __pycache__, tests y storage)
#   - Dockerfile, docker-compose.yml, .dockerignore, requirements-linux.txt
#
# Despues:
#   scp -r deploy/oracle/space/ opc@IP_PUBLICA:~/wordapa7
#   (dentro de la VM) sudo docker compose up -d --build

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$out = Join-Path $PSScriptRoot 'space'

Write-Host "[1/4] Compilando frontend (npm run build)..."
Push-Location $root
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build fallo' }
} finally {
    Pop-Location
}

Write-Host "[2/4] Limpiando carpeta de destino..."
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Path $out | Out-Null

Write-Host "[3/4] Copiando backend + frontend + compose..."
Copy-Item -Recurse (Join-Path $root 'python') (Join-Path $out 'python')
Copy-Item -Recurse (Join-Path $root 'dist') (Join-Path $out 'dist')
Copy-Item (Join-Path $PSScriptRoot 'Dockerfile') $out
Copy-Item (Join-Path $PSScriptRoot 'docker-compose.yml') $out
Copy-Item (Join-Path $PSScriptRoot '.dockerignore') $out
Copy-Item (Join-Path $root 'deploy\hf\requirements-linux.txt') $out

Write-Host "[4/4] Limpiando basura del backend copiado..."
$py = Join-Path $out 'python'
Get-ChildItem -Recurse -Path $py -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force
Remove-Item -Recurse -Force (Join-Path $py 'tests') -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $py 'storage') -ErrorAction SilentlyContinue
Get-ChildItem -Path $py -Filter 'test_*.py' | Remove-Item -Force
Get-ChildItem -Path $py -Filter '*.pyc' | Remove-Item -Force

Write-Host ""
Write-Host "Listo. Contenido en: $out"
Write-Host "Subilo con:"
Write-Host "  scp -r $out opc@IP_PUBLICA:~/wordapa7"
Write-Host "y en la VM: sudo docker compose up -d --build"
