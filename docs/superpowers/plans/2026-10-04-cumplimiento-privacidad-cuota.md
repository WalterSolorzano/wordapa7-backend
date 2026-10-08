# Cumplimiento, privacidad y cuota visible — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario sepa, antes de usar IA, que su texto sale a un tercero; que haya un documento versionado con las políticas de cada proveedor; que vea la cuota consumida; y que el modo local (Ollama) sea una opción explícita.

**Architecture:** Todo vive en la pestaña Conexión (`src/components/settings/tabs/ConexionTab.tsx`) y en un documento nuevo `docs/politicas-proveedores.md`. El aviso de privacidad complementa el `LLMConsentDialog` existente (no lo reemplaza). La UI de cuota consume la tabla de límites del plan de motor anti-ban y el estado del scheduler. El modo local deja de ser un campo de URL genérico y se convierte en una opción con URL por defecto de Ollama.

**Tech Stack:** React 18, TypeScript, Vite, Zustand, Vitest, `lucide-react`. Backend FastAPI (solo lectura de estado).

**Spec:** `docs/superpowers/specs/2026-10-04-cumplimiento-privacidad-cuota-design.md`

## Global Constraints

- Cero emojis en cualquier cadena, UI, comentario o plantilla. Íconos solo `lucide-react` (no emojis ni caracteres pictóricos).
- Colores solo por tokens CSS (`var(--...)`); prohibido hex.
- La telemetría sigue opt-in y **nunca** envía contenido del documento.
- El aviso de privacidad **complementa** `LLMConsentDialog.tsx`; no lo elimina ni cambia su copy de consentimiento.
- `npm test` (Vitest) y `npx tsc --noEmit` deben quedar limpios.
- Un commit atómico por tarea, tests verdes antes de commitear.

## Review Focus

1. **Usuario que nunca abrió Ajustes->Conexión**: debe encontrarse el aviso al entrar, no solo al ejecutar IA.
2. **Sin claves puestas**: la UI de cuota no debe mostrar "0/0" confuso; debe decir que no hay cuota que mostrar.
3. **Modo local elegido**: el aviso de privacidad cambia de tenor (no sale nada a la nube) y el botón de proveedor queda deshabilitado.
4. **Proveedor sin dato de cuota** (mistral/zenmux): la UI no inventa un número; dice "sin dato".
5. **El documento de políticas**: cada fila cita fuente y fecha; ninguna fila inventa límites.

Cada línea de arriba queda fijada por un test (source-based o de render) en la tarea que posee el código.

---

## Estructura de archivos

- `docs/politicas-proveedores.md` — **nuevo**. Tabla versionada: proveedor, URL de política, retención, límites, fecha de consulta.
- `src/components/settings/tabs/ConexionTab.tsx` — **modificar**. Aviso de privacidad, sección de cuota, modo local explícito.
- `src/components/settings/tabs/word/ProbarProveedor.tsx` — **modificar**. Mostrar `Retry-After`/cooldown como motivo legible.
- `src/lib/cuotaProveedor.ts` — **nuevo**. Lee límites del backend y formatea "X/Y hoy · restante: Z".
- `src/__tests__/cumplimientoConexion.test.ts` — **nuevo**. Guardrails source-based + render.
- `src/lib/__tests__/cuotaProveedor.test.ts` — **nuevo**. Formato de cuota.

---

### Task 1: Documento versionado de políticas por proveedor

**Files:**
- Create: `docs/politicas-proveedores.md`

**Interfaces:**
- Consumes: la tabla de límites reales del plan de motor anti-ban (`LIMITES_REALES`), que ya cita fuente y fecha.
- Produces: un documento humano del que la UI solo enlaza (la UI no lo parsea).

- [ ] **Step 1: Escribir el documento**

```markdown
# Políticas de los proveedores de IA

Última revisión: 2026-10-04.

Este documento dice qué hace cada proveedor con el texto que se le envía. Los
límites son los del plan gratuito vigente a la fecha de revisión; cambian sin
aviso, así que la app los trata como referencia y respeta lo que el proveedor
devuelva en cada respuesta (headers de cuota y `Retry-After`).

| Proveedor | Política / límites | Retención de datos | Fecha |
|---|---|---|---|
| Groq | https://console.groq.com/docs/rate-limits | Ver términos del proveedor; no se declara retención fija en la doc de límites | 2026-10-04 |
| OpenRouter | https://openrouter.ai/docs/api-reference/limits | Depende del modelo subyacente enrutado | 2026-10-04 |
| Cerebras | https://inference-docs.cerebras.ai/support/rate-limits | Ver términos del proveedor | 2026-10-04 |
| Google Gemini | https://ai.google.dev/gemini-api/docs/rate-limits | Sujeta a las políticas de uso de Google | 2026-10-04 |
| Cloudflare Workers AI | https://developers.cloudflare.com/workers-ai/platform/limits/ | Ver términos del proveedor | 2026-10-04 |
| NVIDIA NIM | https://build.nvidia.com | Ver términos del proveedor | 2026-10-04 |
| HuggingFace | https://huggingface.co/docs/api-inference/rate-limits | Ver términos del proveedor | 2026-10-04 |
| Mistral | https://docs.mistral.ai | Ver términos del proveedor | 2026-10-04 |
| ModelScope | https://modelscope.cn/docs | Ver términos del proveedor | 2026-10-04 |
| SambaNova | https://docs.sambanova.ai | Ver términos del proveedor | 2026-10-04 |
| DashScope | https://help.aliyun.com/zh/dashscope | Ver términos del proveedor | 2026-10-04 |
| Agnes AI | (proveedor propio del autor) | Sin terceros | 2026-10-04 |

## Qué envía la app

Al usar una función con IA (auditoría, captions, copiloto), el texto del párrafo
o el prompt viaja al proveedor elegido. La app **no** envía: imágenes originales
salvo que la función sea de visión, ni el archivo completo. La telemetría es
opt-in y nunca incluye contenido del documento.
```

- [ ] **Step 2: Commit**

```bash
git add docs/politicas-proveedores.md
git commit -m "docs(privacidad): politicas versionadas por proveedor de IA"
```

---

### Task 2: Aviso de envío de texto a terceros en la pestaña Conexión

**Files:**
- Modify: `src/components/settings/tabs/ConexionTab.tsx` (junto a `nota-de-seguridad`, L256-265)
- Test: `src/__tests__/cumplimientoConexion.test.ts`

**Interfaces:**
- Consumes: `aiProviderConfig.useLocal` para el tenor del aviso.
- Produces: un `<p data-testid="aviso-envio-externo">` en la sección de claves.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// src/__tests__/cumplimientoConexion.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fuente = readFileSync(
  resolve(__dirname, '../components/settings/tabs/ConexionTab.tsx'),
  'utf-8',
);

describe('aviso de cumplimiento en la pestana Conexion', () => {
  it('declara que el texto sale a un tercero', () => {
    expect(fuente).toContain('aviso-envio-externo');
    expect(fuente.toLowerCase()).toContain('sale de tu equipo');
  });

  it('el aviso cambia cuando el modo local esta activo', () => {
    expect(fuente).toContain('useLocal');
    // El copy local debe aclarar que no sale nada.
    expect(fuente.toLowerCase()).toContain('no sale');
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/__tests__/cumplimientoConexion.test.ts`
Expected: FAIL (falta `aviso-envio-externo`).

- [ ] **Step 3: Agregar el aviso**

En `ConexionTab.tsx`, justo después del `<p data-testid="nota-de-seguridad">` (L265), agregar:

```tsx
        {/* El aviso que faltaba: la nota de arriba habla de cifrado, no de que el
            texto del documento sale de la maquina. Son dos cosas distintas y esta
            es la que la persona necesita saber ANTES de usar IA. */}
        <p
          data-testid="aviso-envio-externo"
          style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}
        >
          {aiProviderConfig.useLocal
            ? 'Con el servidor local activo, el texto de tu documento no sale de tu equipo: se procesa en la dirección que figura abajo.'
            : 'Al usar una función con IA, el texto de tu documento sale de tu equipo y se envía al proveedor que consultes. Revisá las políticas en docs/politicas-proveedores.md antes de trabajar con datos sensibles.'}
        </p>
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/__tests__/cumplimientoConexion.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar que no rompió los tests de la pestaña**

Run: `npx vitest run src/__tests__/conexionTab.test.tsx src/__tests__/conexionNoMiente.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/tabs/ConexionTab.tsx src/__tests__/cumplimientoConexion.test.ts
git commit -m "feat(privacidad): aviso de envio de texto a terceros en la pestana Conexion"
```

---

### Task 3: UI de cuota y estado de proveedor

**Files:**
- Create: `src/lib/cuotaProveedor.ts`
- Modify: `src/components/settings/tabs/ConexionTab.tsx`
- Modify: `src/components/settings/tabs/word/ProbarProveedor.tsx`
- Test: `src/lib/__tests__/cuotaProveedor.test.ts`

**Interfaces:**
- Consumes: `/ai/health` (ya consultado por `AIBatteryIndicator`) y el campo `_MOTIVO_DE_ESTADO` del backend.
- Produces:
  - `formatearCuota(usado: number | null, cupo: number | null, restante: number | null): string` → `"12/450 hoy · restante: 438"` o `"sin dato de cuota"` si `cupo` es null.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// src/lib/__tests__/cuotaProveedor.test.ts
import { describe, expect, it } from 'vitest';
import { formatearCuota } from '../cuotaProveedor';

describe('formatearCuota', () => {
  it('formatea con dato', () => {
    expect(formatearCuota(12, 450, 438)).toBe('12/450 hoy · restante: 438');
  });

  it('sin dato no inventa numeros', () => {
    expect(formatearCuota(null, null, null)).toBe('sin dato de cuota');
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/__tests__/cuotaProveedor.test.ts`
Expected: FAIL ("formatearCuota is not a function").

- [ ] **Step 3: Crear `cuotaProveedor.ts`**

```typescript
// Formatea la cuota del proveedor para la pestana Conexion. Nunca inventa un
// numero: si el proveedor no declara cuota, dice "sin dato".
export function formatearCuota(
  usado: number | null,
  cupo: number | null,
  restante: number | null,
): string {
  if (cupo === null || usado === null || restante === null) {
    return 'sin dato de cuota';
  }
  return `${usado}/${cupo} hoy · restante: ${restante}`;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/__tests__/cuotaProveedor.test.ts`
Expected: PASS.

- [ ] **Step 5: Mostrar la cuota en la pestaña**

En `ConexionTab.tsx`, dentro de la sección "Proveedor" (tras el `<select>`, L177), agregar una línea por proveedor con clave que muestre `formatearCuota(...)` leyendo del estado de salud que ya existe (`AIBatteryIndicator` consulta `/ai/health`). Si el backend aún no expone cuota por proveedor (llega en el plan anti-ban), mostrar `sin dato de cuota` — el formateador ya lo maneja.

- [ ] **Step 6: Motivo legible de cooldown en ProbarProveedor**

En `ProbarProveedor.tsx` (L80-99), si el estado es `rate_limited`, mostrar en el `title` y en el texto el `Retry-After` cuando venga: `"Limitado por cuota · reintentar en Ns"` en vez de solo `"Fallo con 429"`.

- [ ] **Step 7: Correr y commit**

Run: `npx vitest run src/lib/__tests__/cuotaProveedor.test.ts src/__tests__/conexionTab.test.tsx`
Expected: PASS.

```bash
git add src/lib/cuotaProveedor.ts src/lib/__tests__/cuotaProveedor.test.ts src/components/settings/tabs/ConexionTab.tsx src/components/settings/tabs/word/ProbarProveedor.tsx
git commit -m "feat(cuota): visibilidad de cuota y estado de proveedor en la pestana Conexion"
```

---

### Task 4: Modo local explícito (Ollama) y desambiguar `ollama_cloud`

**Files:**
- Modify: `src/components/settings/tabs/ConexionTab.tsx` (sección Diagnóstico, L187-240)
- Test: `src/__tests__/cumplimientoConexion.test.ts`

**Interfaces:**
- Consumes: `aiProviderConfig.useLocal`, `aiProviderConfig.localUrl`.
- Produces: un botón/atajo que rellena la URL de Ollama local (`http://localhost:11434/v1`).

- [ ] **Step 1: Escribir el test que falla**

Agregar a `src/__tests__/cumplimientoConexion.test.ts`:

```typescript
  it('ofrece la URL de Ollama local como opcion explicita', () => {
    expect(fuente).toContain('localhost:11434');
    expect(fuente).toContain('Ollama');
  });

  it('desambigua ollama_cloud de Ollama local', () => {
    // El copy debe aclarar que ollama_cloud es un proveedor de nube aparte.
    expect(fuente.toLowerCase()).toContain('ollama cloud');
  });
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/__tests__/cumplimientoConexion.test.ts`
Expected: FAIL.

- [ ] **Step 3: Agregar la opción de Ollama local**

En la sección "Diagnóstico del motor", junto al campo de URL local, agregar un botón que ponga `localUrl` a `http://localhost:11434/v1`:

```tsx
        <button
          type="button"
          data-testid="usar-ollama-local"
          onClick={() => setAiProviderConfig({ useLocal: true, localUrl: 'http://localhost:11434/v1' })}
          style={{
            padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--text-xs)',
            background: 'var(--bg-base)', color: 'var(--color-text-primary)',
            border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          }}
        >
          Usar Ollama en este equipo (localhost:11434)
        </button>
```

Y un texto que aclare: `"«Ollama cloud» es un proveedor de nube aparte; este botón usa el Ollama instalado en tu equipo, que no envía nada afuera."`

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/__tests__/cumplimientoConexion.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificación de tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/tabs/ConexionTab.tsx src/__tests__/cumplimientoConexion.test.ts
git commit -m "feat(privacidad): modo local explicito con Ollama y desambiguacion de ollama_cloud"
```

---

## Criterios de aceptación (del spec)

- [ ] Aviso de envío de texto a terceros en la pestaña Conexión, con tenor distinto en modo local.
- [ ] Documento versionado de políticas por proveedor con fuente y fecha.
- [ ] UI de cuota (`X/Y hoy · restante: Z`) y "sin dato de cuota" cuando no hay dato.
- [ ] Motivo legible de cooldown (`Retry-After`) en ProbarProveedor.
- [ ] Botón de Ollama local y desambiguación de `ollama_cloud`.
- [ ] Tests: `npx vitest run src/__tests__/cumplimientoConexion.test.ts src/lib/__tests__/cuotaProveedor.test.ts` verde; `npx tsc --noEmit` limpio.
- [ ] Cero emojis; solo tokens CSS.
