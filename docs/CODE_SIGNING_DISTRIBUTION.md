# Code Signing para Distribucion Publica — Guia de Integracion

**Proyecto:** WordAPA7  
**Version:** 1.0.35  
**Fecha:** 2026-08-22  

---

## Resumen Ejecutivo

Este documento describe como eliminar las advertencias de Windows SmartScreen para WordAPA7 al distribuirlo publicamente. La opcion recomendada es **SignPath Foundation** (gratis para OSS) con **Certum Open Source** como plan B.

---

## 1. Pre-requisitos para SignPath Foundation

SignPath requiere que el proyecto sea open source con licencia OSI aprobada.

### 1.1 Agregar licencia MIT al proyecto

**Paso 1:** Editar `package.json` y agregar el campo `license`:

```json
{
  "name": "wordapa7",
  "productName": "WordAPA7",
  "description": "Herramienta inteligente para dar formato APA 7",
  "author": "Antigravity",
  "version": "1.0.35",
  "license": "MIT",
  "private": true,
  ...
}
```

**Paso 2:** Crear archivo `LICENSE` en la raiz del repositorio:

```
MIT License

Copyright (c) 2026 Walter Solorzano

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 1.2 Asegurar que el repositorio sea publico

El repositorio `https://github.com/WalterSolorzano/ProyectoAPA7` debe ser publico.
Verificar en: GitHub > Settings > General > Danger Zone > Change repository visibility.

### 1.3 Tener al menos un release publicado

WordAPA7 ya tiene releases publicados via `electron-builder --publish always`
que sube automaticamente a GitHub Releases cuando se hace push de un tag `v*.*.*`.

---

## 2. Aplicar a SignPath Foundation

### 2.1 Llenar el formulario

Ir a: https://signpath.org/apply

Datos a proporcionar:

| Campo | Valor |
|-------|-------|
| Project name | WordAPA7 |
| Repository URL | https://github.com/WalterSolorzano/ProyectoAPA7 |
| License | MIT |
| Download URL | https://github.com/WalterSolorzano/ProyectoAPA7/releases |
| Description | Herramienta de escritorio que convierte documentos .docx a formato APA 7 usando IA. Electron + Python/FastAPI. |
| Build platform | GitHub Actions |
| Artifacts to sign | NSIS installer (.exe), Win-unpacked app (.exe) |
| Signing tool | electron-builder / signtool.exe |

### 2.2 Esperar aprobacion

- Tiempo estimado: 1-4 semanas
- SignPath revisa que el proyecto cumpla los criterios:
  - Licencia OSI aprobada
  - Repositorio publico
  - Software ya lanzado
  - Mantenido activamente
  - Sin malware

### 2.3 Configurar SignPath.io

Una vez aprobado:

1. Crear cuenta en https://signpath.io
2. Crear una organizacion
3. Crear un proyecto con slug `wordapa7`
4. Configurar Trusted Build System: GitHub.com
5. Crear signing policy con slug `release-signing`
6. Crear artifact configuration para NSIS installers
7. Generar API token
8. Obtener Organization ID (esquina superior derecha)

---

## 3. Configurar GitHub Secrets y Variables

En GitHub: Settings > Secrets and variables > Actions

### Secrets (secretos encriptados)

| Nombre | Valor |
|--------|-------|
| `SIGNPATH_API_TOKEN` | API token generado en SignPath.io |

### Variables (no secretas)

| Nombre | Valor |
|--------|-------|
| `SIGNPATH_ORG_ID` | UUID de tu organizacion en SignPath.io |

---

## 4. Workflow de GitHub Actions con SignPath

Modificar `.github/workflows/release.yml` para agregar firma despues del build:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  release:
    runs-on: windows-latest
    permissions:
      contents: write
    steps:
    - uses: actions/checkout@v4

    - name: Set up Python
      uses: actions/setup-python@v5
      with:
        python-version: "3.10"
        cache: pip
        cache-dependency-path: requirements.txt

    - name: Install Python dependencies
      run: pip install -r requirements.txt pyinstaller

    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: npm

    - name: Install dependencies
      run: npm ci

    # ── Build sin firmar (sin --publish para no subir a GitHub todavia) ──
    - name: Build backend + frontend + Electron (unsigned)
      run: npm run build:backend && npm run build && npx electron-builder --win --publish never
      env:
        # NO pasar CSC_LINK/CSC_KEY_PASSWORD aqui — SignPath firmara despues
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

    # ── Subir artefacto sin firmar a GitHub Actions ──
    - name: Upload unsigned artifact
      id: upload-unsigned
      uses: actions/upload-artifact@v4
      with:
        name: wordapa7-unsigned
        path: |
          dist-electron-builder/WordAPA7 Setup *.exe
          dist-electron-builder/win-unpacked/WordAPA7.exe

    # ── Firmar con SignPath Foundation ──
    # Solo se ejecuta si SIGNPATH_API_TOKEN esta configurado
    - name: Sign installer with SignPath
      if: env.SIGNPATH_API_TOKEN != ''
      uses: signpath/github-action-submit-signing-request@v2
      with:
        api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
        organization-id: ${{ vars.SIGNPATH_ORG_ID }}
        project-slug: 'wordapa7'
        signing-policy-slug: 'release-signing'
        github-artifact-id: ${{ steps.upload-unsigned.outputs.artifact-id }}
        wait-for-completion: true
        output-artifact-directory: './signed-installer'

    - name: Sign win-unpacked with SignPath
      if: env.SIGNPATH_API_TOKEN != ''
      uses: signpath/github-action-submit-signing-request@v2
      with:
        api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
        organization-id: ${{ vars.SIGNPATH_ORG_ID }}
        project-slug: 'wordapa7'
        signing-policy-slug: 'release-signing'
        github-artifact-id: ${{ steps.upload-unsigned.outputs.artifact-id }}
        wait-for-completion: true
        output-artifact-directory: './signed-app'

    # ── Publicar release firmado en GitHub ──
    - name: Publish signed release
      if: env.SIGNPATH_API_TOKEN != ''
      run: |
        # Copiar binarios firmados al directorio de electron-builder
        Copy-Item "./signed-installer/*.exe" "dist-electron-builder/" -Force
        Copy-Item "./signed-app/WordAPA7.exe" "dist-electron-builder/win-unpacked/" -Force
        # Publicar a GitHub Releases
        npx electron-builder --publish always --prepackaged dist-electron-builder/win-unpacked
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

    # ── Fallback: publicar sin firmar si SignPath no esta configurado ──
    - name: Publish unsigned release (fallback)
      if: env.SIGNPATH_API_TOKEN == ''
      run: npm run electron:build
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        GITHUB_REPOSITORY_OWNER: ${{ github.repository_owner }}
        GITHUB_REPOSITORY_NAME: ${{ github.event.repository.name }}
```

**Nota sobre el env vars:** GitHub Actions solo expone variables de nivel workflow/job al campo `if:` de un step. Por eso `env.SIGNPATH_API_TOKEN` funciona en `if:` pero los secrets no se pueden inlinear directamente.

---

## 5. Plan B: Certum Open Source Cloud (~$58/ano)

Si SignPath rechaza la aplicacion o el proceso es muy lento:

### 5.1 Comprar certificado

1. Ir a https://certum.store/code-signing.html
2. Comprar "Open Source Code Signing in the Cloud" (~$58)
3. Completar verificacion de identidad (1-3 dias)
4. Recibir credenciales de SimplySign (cloud)

### 5.2 Configurar en electron-builder.yml

```yaml
win:
  target: nsis
  icon: build/icon.ico
  certificateFile: build/certum-oss.pfx
  certificatePassword: ${CSC_KEY_PASSWORD}
  signingHashAlgorithms:
    - sha256
```

### 5.3 Configurar GitHub Secrets

| Secret | Valor |
|--------|-------|
| `CSC_LINK` | Base64 del archivo .pfx de Certum |
| `CSC_KEY_PASSWORD` | Password del .pfx |

### 5.4 Workflow simplificado

```yaml
- name: Build and sign
  run: npm run electron:build
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    CSC_LINK: ${{ secrets.CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
```

electron-builder detecta `CSC_LINK` y `CSC_KEY_PASSWORD` automaticamente y firma durante el build.

---

## 6. Plan C: Azure Artifact Signing ($9.99/mes)

Solo disponible para individuos en USA y Canada.

### 6.1 Configurar Azure

1. Crear cuenta en Azure Portal
2. Crear recurso "Trusted Signing" / "Artifact Signing"
3. Crear certificate profile
4. Configurar identity validation

### 6.2 Configurar en electron-builder.yml

```yaml
win:
  target: nsis
  icon: build/icon.ico
  sign:
    type: azure
  azure:
    azureKeyVaultUrl: https://wordapa7-signing.vault.azure.net/
    azureKeyVaultCertificateName: wordapa7-codesign
```

### 6.3 Variables de entorno

```
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
```

---

## 7. Verificacion Post-Firma

Despues de firmar con cualquier opcion, verificar:

```powershell
# Verificar firma del instalador
$signature = Get-AuthenticodeSignature "WordAPA7 Setup 1.0.35.exe"
Write-Host "Status: $($signature.Status)"
Write-Host "Signer: $($signature.SignerCertificate.Subject)"
Write-Host "Issuer: $($signature.SignerCertificate.Issuer)"
Write-Host "Valid from: $($signature.SignerCertificate.NotBefore)"
Write-Host "Valid to: $($signature.SignerCertificate.NotAfter)"

# Resultado esperado con SignPath:
# Status: Valid
# Signer: CN=SignPath Foundation
# Issuer: CN=SignPath Foundation Root CA

# Resultado esperado con Certum:
# Status: Valid
# Signer: CN=WordAPA7 (o tu nombre)
# Issuer: CN=Certum Code Signing CA

# Resultado esperado con Azure:
# Status: Valid
# Signer: CN=Microsoft Azure Artifact Signing
# Issuer: CN=Microsoft Code Signing PCA
```

---

## 8. Como Construir Reputacion de SmartScreen

**Independientemente del metodo de firma elegido**, SmartScreen requiere que el binario acumule descargas para dejar de mostrar advertencias:

| Factor | Impacto |
|--------|---------|
| Firmar consistentemente cada release con el mismo certificado | Alto |
| Numero de descargas unicas del instalador | Alto |
| Tiempo desde la primera firma (mas viejo = mas confianza) | Medio |
| Ratio de usuarios que hacen click en "Ejecutar de todos modos" | Medio |
| Reportes de malware (debe ser cero) | Critico |

**Consejos practicos:**
- No cambies de certificado entre releases (reinicia la reputacion)
- Anade instrucciones claras en la pagina de descarga sobre como bypass SmartScreen
- Considera usar Microsoft Store como canal alternativo para evitar SmartScreen completamente
- La reputacion normalmente se construye en 1-3 meses con suficientes descargas

---

## 9. Estado Actual del Proyecto

| Aspecto | Estado |
|---------|--------|
| Certificado de desarrollo (self-signed) | Configurado en `electron-builder.yml` |
| Script de firma local | `build/sign_code.ps1` |
| Licencia OSI | **PENDIENTE** — agregar `"license": "MIT"` + archivo `LICENSE` |
| Repo publico | Verificar visibilidad de `WalterSolorzano/ProyectoAPA7` |
| Aplicacion a SignPath | **PENDIENTE** |
| Workflow CI/CD con firma | **PENDIENTE** — usar plantilla de Seccion 4 |

---

## 10. Checklist de Accion

- [ ] Agregar `"license": "MIT"` a `package.json`
- [ ] Crear archivo `LICENSE` en raiz del repo
- [ ] Verificar que el repo sea publico en GitHub
- [ ] Aplicar en https://signpath.org/apply
- [ ] Esperar aprobacion (1-4 semanas)
- [ ] Configurar secrets `SIGNPATH_API_TOKEN` y `SIGNPATH_ORG_ID`
- [ ] Actualizar `.github/workflows/release.yml` con pasos de SignPath
- [ ] Probar el workflow con un tag de pre-release
- [ ] Verificar que el EXE firmado diga "SignPath Foundation"
- [ ] (Plan B) Si SignPath no funciona, comprar Certum Open Source Cloud
- [ ] Documentar el proceso de firma en README para futuros mantenedores
