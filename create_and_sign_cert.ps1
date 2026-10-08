# WordAPA7 - Create Self-Signed Code Signing Certificate and Sign EXE Files
# ==========================================================================
# This script:
#   1. Creates a self-signed code signing certificate
#   2. Exports it to a .pfx file
#   3. Imports it to the Trusted Root store
#   4. Signs the EXE files
#   5. Verifies the signatures

$ErrorActionPreference = "Stop"

$projectPath = "C:\Users\--X\.gemini\antigravity\scratch\wordapa7"
$certSubject = "CN=WordAPA7 Local Development"
$pfxPath = Join-Path $projectPath "build\wordapa7-dev-signing.pfx"
$pfxPassword = ConvertTo-SecureString -String "wordapa7dev" -Force -AsPlainText
$timestampUrl = "http://timestamp.digicert.com"

$installerExe = Join-Path $projectPath "dist-electron-builder\WordAPA7 Setup 1.0.35.exe"
$appExe = Join-Path $projectPath "dist-electron-builder\win-unpacked\WordAPA7.exe"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "WordAPA7 Code Signing Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# -------------------------------------------------------------------------
# STEP 1: Create the self-signed code signing certificate
# -------------------------------------------------------------------------
Write-Host ""
Write-Host "[Step 1] Creating self-signed code signing certificate..." -ForegroundColor Yellow

# Check if certificate already exists
$existingCert = Get-ChildItem -Path "Cert:\CurrentUser\My" | Where-Object { $_.Subject -eq $certSubject }
if ($existingCert) {
    Write-Host "  Certificate already exists. Removing old one..." -ForegroundColor DarkYellow
    $existingCert | ForEach-Object {
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("My", "CurrentUser")
        $store.Open("ReadWrite")
        $store.Remove($_)
        $store.Close()
    }
}

# Create the new certificate
$cert = New-SelfSignedCertificate `
    -Subject $certSubject `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -Type CodeSigningCert `
    -NotAfter (Get-Date).AddYears(2)

Write-Host "  Certificate created successfully!" -ForegroundColor Green
Write-Host "  Thumbprint: $($cert.Thumbprint)" -ForegroundColor Gray
Write-Host "  Subject:     $($cert.Subject)" -ForegroundColor Gray
Write-Host "  Valid From:  $($cert.NotBefore)" -ForegroundColor Gray
Write-Host "  Valid To:    $($cert.NotAfter)" -ForegroundColor Gray

# -------------------------------------------------------------------------
# STEP 2: Export the certificate to a .pfx file
# -------------------------------------------------------------------------
Write-Host ""
Write-Host "[Step 2] Exporting certificate to PFX file..." -ForegroundColor Yellow

# Ensure the build directory exists
$buildDir = Join-Path $projectPath "build"
if (-not (Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
}

# Remove old PFX if it exists
if (Test-Path $pfxPath) {
    Remove-Item $pfxPath -Force
}

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pfxPassword | Out-Null

Write-Host "  PFX exported to: $pfxPath" -ForegroundColor Green
Write-Host "  File size: $((Get-Item $pfxPath).Length) bytes" -ForegroundColor Gray

# -------------------------------------------------------------------------
# STEP 3: Import the certificate to Trusted Root Certification Authorities
# -------------------------------------------------------------------------
Write-Host ""
Write-Host "[Step 3] Importing certificate to Trusted Root store..." -ForegroundColor Yellow

# Export the public key (CER) for importing into Root store
$cerPath = Join-Path $env:TEMP "wordapa7-dev-signing.cer"
Export-Certificate -Cert $cert -FilePath $cerPath -Type CERT | Out-Null

# Import into CurrentUser\Root (doesn't require admin)
$rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "CurrentUser")
$rootStore.Open("ReadWrite")
$rootStore.Add($cert)
$rootStore.Close()

Write-Host "  Certificate added to Cert:\CurrentUser\Root" -ForegroundColor Green

# Also import into CurrentUser\TrustedPublisher so SmartScreen/Windows trusts it for execution
$trustedPubStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("TrustedPublisher", "CurrentUser")
$trustedPubStore.Open("ReadWrite")
$trustedPubStore.Add($cert)
$trustedPubStore.Close()

Write-Host "  Certificate added to Cert:\CurrentUser\TrustedPublisher" -ForegroundColor Green

# Clean up temp CER
Remove-Item $cerPath -Force -ErrorAction SilentlyContinue

# -------------------------------------------------------------------------
# STEP 4: Sign the EXE files
# -------------------------------------------------------------------------
Write-Host ""
Write-Host "[Step 4] Signing EXE files..." -ForegroundColor Yellow

# Get the certificate from the store (re-fetch to ensure we have a fresh reference)
$signingCert = Get-ChildItem -Path "Cert:\CurrentUser\My" | Where-Object { $_.Subject -eq $certSubject } | Select-Object -First 1

if (-not $signingCert) {
    Write-Host "  ERROR: Could not find the signing certificate in the store!" -ForegroundColor Red
    exit 1
}

Write-Host "  Using certificate: $($signingCert.Thumbprint)" -ForegroundColor Gray

# Sign the installer EXE
Write-Host ""
Write-Host "  Signing: $(Split-Path $installerExe -Leaf)" -ForegroundColor Cyan
if (Test-Path $installerExe) {
    $result = Set-AuthenticodeSignature -FilePath $installerExe -Certificate $signingCert -TimestampServer $timestampUrl
    Write-Host "    Status: $($result.Status)" -ForegroundColor $(if ($result.Status -eq 'Valid') { 'Green' } else { 'Red' })
    if ($result.StatusMessage) { Write-Host "    Message: $($result.StatusMessage)" -ForegroundColor Gray }
} else {
    Write-Host "    FILE NOT FOUND: $installerExe" -ForegroundColor Red
}

# Sign the app EXE
Write-Host ""
Write-Host "  Signing: $(Split-Path $appExe -Leaf)" -ForegroundColor Cyan
if (Test-Path $appExe) {
    $result = Set-AuthenticodeSignature -FilePath $appExe -Certificate $signingCert -TimestampServer $timestampUrl
    Write-Host "    Status: $($result.Status)" -ForegroundColor $(if ($result.Status -eq 'Valid') { 'Green' } else { 'Red' })
    if ($result.StatusMessage) { Write-Host "    Message: $($result.StatusMessage)" -ForegroundColor Gray }
} else {
    Write-Host "    FILE NOT FOUND: $appExe" -ForegroundColor Red
}

# -------------------------------------------------------------------------
# STEP 5: Verify the signatures
# -------------------------------------------------------------------------
Write-Host ""
Write-Host "[Step 5] Verifying signatures..." -ForegroundColor Yellow

foreach ($exe in @($installerExe, $appExe)) {
    $fileName = Split-Path $exe -Leaf
    Write-Host ""
    Write-Host "  Verifying: $fileName" -ForegroundColor Cyan
    if (Test-Path $exe) {
        $sig = Get-AuthenticodeSignature -FilePath $exe
        Write-Host "    Status:         $($sig.Status)" -ForegroundColor $(if ($sig.Status -eq 'Valid') { 'Green' } else { 'Red' })
        Write-Host "    StatusMessage:  $($sig.StatusMessage)" -ForegroundColor Gray
        Write-Host "    Signer:         $($sig.SignerCertificate.Subject)" -ForegroundColor Gray
        Write-Host "    Thumbprint:     $($sig.SignerCertificate.Thumbprint)" -ForegroundColor Gray
        if ($sig.TimeStamperCertificate) {
            Write-Host "    Timestamp:      $($sig.TimeStamperCertificate.Subject)" -ForegroundColor Gray
            Write-Host "    TimeStamper:    $($sig.TimeStamperCertificate.NotAfter)" -ForegroundColor Gray
        }
    } else {
        Write-Host "    FILE NOT FOUND: $exe" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Done!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
