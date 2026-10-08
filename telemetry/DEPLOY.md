# Deploy del Worker de Telemetría

## Requisitos previos
1. Tener una cuenta de Cloudflare (gratuita)
2. Tener Wrangler instalado: `npm install -g wrangler` (o usar `npx wrangler`)

## Pasos para deployar

### 1. Autenticarse con Cloudflare
```bash
cd telemetry
npx wrangler login
```

### 2. Crear el KV namespace para rate-limiting
```bash
npx wrangler kv:namespace create "TELEMETRY_KV"
```
Copiar el ID que devuelve y reemplazar `TELEMETRY_KV_PLACEHOLDER` en `wrangler.toml`.

### 3. Crear un GitHub fine-grained token
1. Ir a https://github.com/settings/tokens?type=beta
2. "Generate new token" → seleccionar solo este repo
3. Permisos: `Issues: Read and write`
4. Copiar el token generado

### 4. Configurar el secret del token
```bash
npx wrangler secret put GITHUB_TOKEN
# Pegar el token cuando lo pida
```

### 5. Configurar el nombre del repo (si no es el default)
```bash
npx wrangler secret put GITHUB_REPO
# Valor: "TU_USUARIO/wordapa7"
```

### 6. Deployar
```bash
npx wrangler deploy
```

### 7. Actualizar la URL del worker en el cliente
Copiar la URL que devuelve el deploy (algo como `https://wordapa7-telemetry.TU_USUARIO.workers.dev`)
y actualizar `WORKER_URL` en `src/telemetry/client.ts`.
