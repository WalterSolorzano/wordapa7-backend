# WordAPA7 — Preparar la carpeta del Space de Hugging Face
#
# Ensambla deploy/hf/space/ con todo lo que necesita el Dockerfile:
#   - dist/            frontend compilado (npm run build)
#   - python/          backend (filtra __pycache__, tests y storage)
#   - Dockerfile, README.md (front matter del Space), .dockerignore
#   - requirements-linux.txt
#
# Despues subis deploy/hf/space/ al repo del Space:
#   git clone https://huggingface.co/spaces/TU_USUARIO/wordapa7-web
#   (copiar el contenido de deploy/hf/space/ dentro) + git push

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

Write-Host "[3/4] Copiando backend + frontend..."
Copy-Item -Recurse (Join-Path $root 'python') (Join-Path $out 'python')
Copy-Item -Recurse (Join-Path $root 'dist') (Join-Path $out 'dist')
Copy-Item (Join-Path $PSScriptRoot 'Dockerfile') $out
Copy-Item (Join-Path $PSScriptRoot 'README.md') $out
Copy-Item (Join-Path $PSScriptRoot '.dockerignore') $out
Copy-Item (Join-Path $PSScriptRoot 'requirements-linux.txt') $out

Write-Host "[4/4] Limpiando basura del backend copiado..."
$py = Join-Path $out 'python'
Get-ChildItem -Recurse -Path $py -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force
Remove-Item -Recurse -Force (Join-Path $py 'tests') -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $py 'storage') -ErrorAction SilentlyContinue
Get-ChildItem -Path $py -Filter 'test_*.py' | Remove-Item -Force
Get-ChildItem -Path $py -Filter '*.pyc' | Remove-Item -Force

Write-Host ""
Write-Host "Listo. Contenido en: $out"
Write-Host "Subilo al Space con:"
Write-Host "  git clone https://huggingface.co/spaces/TU_USUARIO/wordapa7-web"
Write-Host "  (copiar el contenido de $out dentro del repo del Space y pushear)"
