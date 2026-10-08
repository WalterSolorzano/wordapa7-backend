Write-Host "Iniciando WordAPA7..." -ForegroundColor Cyan
Write-Host "Verificando y recompilando frontend..." -ForegroundColor Yellow
npm run build
Write-Host "Abre http://localhost:8742 en tu navegador." -ForegroundColor Green
Write-Host "Presiona Ctrl+C para detener." -ForegroundColor Yellow
Write-Host ""

$venvPython = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
if (Test-Path $venvPython) {
    & $venvPython python\main.py
} else {
    python python/main.py
}
