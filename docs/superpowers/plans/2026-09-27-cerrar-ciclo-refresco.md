# Cerrar el ciclo de refresco — Plan de implementación

> **EJECUTADO PARCIALMENTE, LEÉ EL BLOQUE DE ARRIBA.** Este plan cubre el hueco
> que quedó abierto en `2026-09-27-refresco-por-cambios-de-word.md`. Lo ya
> hecho: el diff por contenido, el endpoint, el aviso honesto y la cache de LLM.

**Goal:** que cuando Word guarde, el documento en pantalla se recargue, los
hallazgos se vuelvan a calcular y el aviso diga lo que de verdad pasó — sin pagar
LLM por párrafos que no cambiaron.

**Architecture:** El diff ya existe y es correcto. Lo que falta es que alguien lo
**consuma**: recargar el documento, tirar los hallazgos rancios y re-correr los
motores. Y hay un solo motor caro, así que la arquitectura sale de ahí.

**Tech Stack:** Python 3.11+ / FastAPI, React 18 / Zustand, Vitest, pytest.

**Spec:** la investigación de pipeline de esta sesión. Ledger:
`.superpowers/sdd/2026-09-27-inicio-cinematografico/progress.md`

---

## El hallazgo que determina la arquitectura

**Los hallazgos están anclados a `element_id`, y `element_id` es un índice
posicional.** `docx_parser.py:1099` genera `elem_{contador}`. Insertar un párrafo
arriba del todo en Word corre todos los ids de abajo con el MISMO texto.

De ahí sale la consecuencia que manda sobre todo lo demás: **no se pueden
parchear los hallazgos.** La estrategia obvia —"conservá los de los párrafos que
no cambiaron"— es peor que no hacer nada: `elem_42` ya no es el mismo párrafo, así
que un hallazgo conservado queda pegado al párrafo equivocado, con el subrayado
en el lugar equivocado y el mensaje de la otra frase. Un error visible y
difícil de leer como error.

La única operación correcta es **recalcular todo**. Y sale barato, porque
casi todo el motor es local:

| Motor | Costo | Dónde |
|---|---|---|
| `audit_elements` (ortografía, muletillas, Bloom, pegado) | **local, gratis** | `proactive_auditor.py:386` |
| `analyze_ai_risk` (mapa de calor de IA) | **local, gratis** | `classification/ai_detector.py` — no importa `api_key`, ni `httpx` |
| `validate_citations_with_llm` | LLM, `use_cache=True` | `apa_validator.py:389` |
| **`refine_with_llm`** | **LLM, sin cache, y por lotes** | `proactive_auditor.py:564` |

## Y el único motor caro está roto por diseño

`refine_with_llm` (`proactive_auditor.py:564`) junta **hasta 60 hallazgos en UN
prompt** y llama a NVIDIA con `requests.post` directo
(`proactive_auditor.py:597-604`), sin pasar por `execute_with_specialty`. Tres
fallos encadenados:

1. **No usa la cache.** Se salta todo el trabajo de `1a41622`.
2. **El prompt depende del conjunto entero.** Un hallazgo nuevo o un corrector
   distinto cambian el hash del prompt y se repaga la llamada completa.
3. **La respuesta es por ítem, no del lote.** Pide `[{"i":int,"keep":bool,
   "suggestion":str|null}]` — la respuesta del ítem 7 no depende del ítem 8. El
   lote es una optimización de rate-limit que destruye la granularidad de la
   cache.

Un LLM que responde a 20 preguntas y las manda en un sobre no se puede cachear por
pregunta. Este se puede, y ahí es donde `audit_registry` por fin tiene un trabajo
real que hacer.

> **Esto cambia la decisión (A) que ya tomaste.** `audit_registry` quedó sin
> cablear porque la cache de `execute_with_speciality` ya cubría el gasto. Eso
> era cierto para todos los motores **menos este**. Sigue siendo cierto que
> enchufarlo en los 12 llamados es redundante; no es cierto que sea redundante
> acá. La Task 4 lo enchufa en un solo lugar, que es el único que lo necesita.

---

## Global Constraints

- **Cero emojis** (`AGENTS.md` §1). Solo `lucide-react`, `strokeWidth = var(--icon-stroke)`.
- **Sin literales de color.** Solo variables CSS. `noHardcodedColors.test.ts` vigila
  `src/components/**` y `src/lib/**`.
- **Ninguna UI puede afirmar algo que el código no hace.** El texto del aviso se
  arma con lo que el pipeline devolvió, no con lo que el diff suponía.
- **Nunca escribir en el `.docx` del usuario desde el watcher.** El watcher es
  supervisor, no escritor. `save_session_state` escribe en SQLite.
- **`refine_with_llm` nunca lanza.** Contrato actual (`proactive_auditor.py:568`):
  ante cualquier error devuelve los findings intactos y `False`. Se preserva.
- `npx vitest` **no type-chequea**: correr `npx tsc --noEmit` aparte.
- PowerShell no sirve para cirugía por índice de array en archivos largos. Usar la
  herramienta de edición por contenido. Después de cada escritura larga, grepear
  `[\u4e00-\u9fff\uac00-\ud7af\ufffd]`: se colaron CJK y palabras en inglés
  varias veces, incluso en comentarios.

## Review Focus

Cinco entradas que el código no ejercita y que son las que más van a morder:

1. **Word inserta un párrafo arriba del todo.** Todos los `element_id` de abajo se
   corren en uno. Un hallazgo que sobreviva al refresco queda pegado al párrafo
   equivocado. Es el modo de falla central de este plan.
2. **El LLM devuelve texto que no es JSON** (o se corta a mitad). La respuesta
   vieja tiene que sobrevivir intacta, no quedar a medias.
3. **La recarga del documento falla** (backend reiniciándose). Los hallazgos
   viejos deben quedarse: es preferible mostrar un hallazgo viejo a vaciar la
   pantalla sin avisar.
4. **Word guardó pero no cambió nada** (un Ctrl+S que solo toca estilos). No se
   re-corre ningún motor y no se toca ningún estado.
5. **Un párrafo se borra en Word.** Su hallazgo no puede seguir en la lista de
   pendientes del rail: `railPending.ts` deriva de `collectAuditItems`, así que
   un hallazgo vivo de un párrafo muerto es un pendiente que nadie puede cerrar.

---

### Task 1: El veredicto del LLM se cachea por ítem, no por lote

**Files:**
- Modify: `python/modules/proactive_auditor.py:564-620` (`refine_with_llm`)
- Test: `python/tests/test_refine_cache.py`

**Interfaces:**
- Consumes: `modules.audit_registry.registrar(session_id, hash, fase, hallazgos)` y
  `reusar(session_id, hash, fase)`. `hash_texto` va a ser
  `audit_registry` sobre `sha256` de `f"{kind}|{match}|{excerpt}|{phase}"`; `fase`
  es `f["phase"]`.
- Produces: `refine_with_llm(findings, elements, api_key, timeout=12.0, session_id="")`.
  Firma compatible hacia atrás: `session_id` con default `""` deja el
  comportamiento actual (sin cache) cuando no se pasa.

- [ ] **Step 1: Escribí el test que falla**

```python
def test_una_consulta_ya_respondida_no_se_vuelve_a_preguntar():
    """EL DINERO. Doce Guardados de Word y un solo parrafo con una tilde
    perdida. Con el lote entero como clave, los doce se pagan completos. Con la
    clave por item, el primero se paga y los once son un acierto de cache."""
    from modules import proactive_auditor as pa
    llamadas = {"n": 0}

    def post_falso(url, **kw):
        llamadas["n"] += 1
        return _FakeResp('[{"i":0,"keep":true,"suggestion":"tilde"}]')

    _cache_limpia()
    pa.refine_with_llm(_hallazgos(1), _elementos(), "k", session_id="s1",
                       _post=post_falso)
    pa.refine_with_llm(_hallazgos(1), _elementos(), "k", session_id="s1",
                       _post=post_falso)
    assert llamadas["n"] == 1


def test_una_tilde_igual_en_otra_fase_si_se_pregunta():
    """La palabra repetida en Metodo y en Resultados es la misma palabra y son
    dos preguntas distintas: los motores con ambito meten la fase en el prompt.
    Sin la fase en la clave, una contamina a la otra."""
    ...
    pa.refine_with_llm(_hallazgos(1, phase="metodo"), ..., session_id="s1")
    pa.refine_with_llm(_hallazgos(1, phase="resultados"), ..., session_id="s1")
    assert llamadas["n"] == 2
```

Los `_post` y `_cache_limpia` son helpers del archivo de test: `_post` se
inyecta por parámetro con default `requests.post` para que la prueba no toque la
red, y `_cache_limpia()` vacía `audit_registry._EN_MEMORIA`.

- [ ] **Step 2: Corré el test y verificá que falla**

Run: `pytest python/tests/test_refine_cache.py -q`
Expected: FAIL — `TypeError: refine_with_llm() got an unexpected keyword argument 'session_id'`

- [ ] **Step 3: Implementá el gateo por ítem**

En `refine_with_llm`, después de construir `dubious` y ANTES de armar el prompt:

```python
    session_id = session_id or ""
    por_preguntar = []
    for f in dubious:
        clave = _clave_de_consulta(f, text_by_id)
        guardado = reusar(session_id, clave, f.get("phase", "global")) if session_id else None
        if guardado is not None:
            _aplicar_veredicto(f, guardado)
        else:
            por_preguntar.append((clave, f))
    if not por_preguntar:
        return findings, True
```

Y después de parsear `verdicts`, registrar cada uno con
`registrar(session_id, clave, fase, veredicto)`.

Dos reglas que no son negociables:

- **Un LLM que no devuelve JSON NO borra los veredictos cacheados.** Si el parseo
  falla, se devuelve `findings` intacto y `False` (el contrato actual), y el
  `_EN_MEMORIA` queda como estaba.
- **`_aplicar_veredicto` no toca la Finding si el veredicto es `None`.** Un
  veredicto ausente no es un veredicto negativo.

- [ ] **Step 4: Corré el test y verificá que pasa**

Run: `pytest python/tests/test_refine_cache.py -q`
Expected: PASS

- [ ] **Step 5: Corré la suite del backend**

Run: `pytest python/tests/ -q`
Expected: `PASSED` (hoy son 725 passed, 14 skipped)

- [ ] **Step 6: Commiteá**

```bash
git add python/modules/proactive_auditor.py python/tests/test_refine_cache.py
git commit -m "gasto: el veredicto del corrector se cachea por item, no por lote

refine_with_llm juntaba hasta 60 hallazgos en UN prompt y llamaba a NVIDIA con
requests.post directo, sin pasar por execute_with_speciality. Tres fallos
encadenados: no usaba la cache, el prompt dependia del conjunto entero (un
hallazgo nuevo re pagaba los 60), y la respuesta es por item — el lote es una
optimizacion de rate limit que destruye la granularidad de la cache.

Un LLM que responde a 20 preguntas y las manda en un sobre no se puede cachear
por pregunta. Este si, y con la fase en la clave porque el mismo error en
Metodo y en Resultados es dos preguntas."
```

---

### Task 2: La acción de refresco en el store

**Files:**
- Modify: `src/store/slices/documentSlice.ts` (acción nueva `refrescarDesdeWord`)
- Modify: `src/store/types.ts:333` (la firma en `DocState`)
- Modify: `src/api/backend.ts` (agregar `refreshFromWord`)
- Test: `src/__tests__/refrescoStore.test.ts`

**Interfaces:**
- Consumes: `src/lib/wordRefresh.ts` → `refrescarDesdeWord(sessionId, ruta)` y
  `DiffWord`. Ya existen y ya tienen 18 tests.
- Produces: `DocState.refrescarDesdeWord: (ruta: string) => Promise<RefrescoResultado>`

```ts
export interface RefrescoResultado {
  listo: boolean;
  cambiado: boolean;
  nuevos: number;
  eliminados: number;
  /** Lo que la reauditoria REALMENTE encontro. `null` = no se re-audito. */
  hallazgos: number | null;
}
```

`hallazgos: number | null` en vez de `number` a propósito: `0` y "no se contó"
son cosas distintas, y el aviso no puede decir "0 hallazgos" cuando en realidad no
se miró. Es la misma distinción que `reusar` devuelve `None` vs `[]`.

- [ ] **Step 1: Escribí el test que falla**

```ts
it('UN GUARDADO QUE NO CAMBIO NADA NO TOCA NADA', async () => {
  // La razon por la que existe la palabra "cambiado" en el contrato. Un Ctrl+S
  // que solo toca estilos no puede costar una reauditoria entera, y sobre todo
  // no puede vaciar los hallazgos: se perderian por un Ctrl+S.
  const pedir = vi.fn().mockResolvedValue(diffSinCambios());
  const { refrescarDesdeWord } = montar({ pedir });

  const r = await refrescarDesdeWord('C:/t.docx');

  expect(r.cambiado).toBe(false);
  expect(recoverSession).not.toHaveBeenCalled();
  expect(runProofreadBatch).not.toHaveBeenCalled();
  expect(cambiosEnHallazgos()).toEqual([]);  // el store quedo intacto
});
```

- [ ] **Step 2: Corré el test y verificá que falla**

Run: `npx vitest run src/__tests__/refrescoStore.test.ts`
Expected: FAIL — no existe `refrescarDesdeWord` en el store.

- [ ] **Step 3: Implementá la acción**

```ts
refrescarDesdeWord: async (ruta) => {
  const { doc } = get();
  if (!doc) return { listo: false, cambiado: false, nuevos: 0, eliminados: 0, hallazgos: null };
  const d = await refrescarDesdeWord(doc.session_id, ruta);
  if (!d.listo || !d.cambiado) {
    return { listo: d.listo, cambiado: d.cambiado, nuevos: 0, eliminados: 0, hallazgos: null };
  }
  // El backend YA guardo el documento reparseado. Recargarlo es la unica forma
  // de que la pantalla y el backend no se contradigan.
  const recargado = migrateDocument(await api.recoverSession(doc.session_id));
  set((state) => ({ doc: recargado, tabDocs: { ...state.tabDocs, [doc.session_id]: recargado } }));
  return { listo: true, cambiado: true, nuevos: d.ids_nuevos.length,
           eliminados: d.ids_eliminados.length, hallazgos: null };
},
```

`migrateDocument` es obligatorio: `openSession` (`documentSlice.ts:302`) lo usa y
sin él un documento con campos viejos rompe los componentes.

- [ ] **Step 4: Corré el test y verificá que pasa, y type-chequeá**

Run: `npx vitest run src/__tests__/refrescoStore.test.ts && npx tsc --noEmit`
Expected: PASS / sin salida

- [ ] **Step 5: Commiteá**

```bash
git add src/store/slices/documentSlice.ts src/store/types.ts src/api/backend.ts src/__tests__/refrescoStore.test.ts
git commit -m "refresh: la accion de refresco recarga el documento y no toca nada si no cambio"
```

---

### Task 3: Tirar los hallazgos rancios (el modo de falla central)

**Files:**
- Modify: `src/store/slices/auditSlice.ts` (acción `invalidarHallazgosRancios`)
- Test: `src/__tests__/hallazgosRancios.test.ts`

**Interfaces:**
- Consumes: `DocState.refrescarDesdeWord` de la Task 2.
- Produces: `DocState.invalidarHallazgosRancios: () => void`

- [ ] **Step 1: Escribí el test que falla**

```ts
it('UN HALLAZGO DE UN PARRAFO QUE SE BORRO NO PUEDE SEGUIR PENDIENTE', () => {
  // Review Focus #5. Un hallazgo vivo de un parrafo que ya no esta es un
  // pendiente que nadie puede cerrar: no hay texto al que volver, y el rail lo
  // cuenta igual porque railPending deriva de collectAuditItems.
  montarConHallazgos([{ element_id: 'elem_7', kind: 'ortografia' }]);
  invalidarHallazgosRancios();
  expect(collectAuditItems(fuentes()).length).toBe(0);
});

it('TODOS LOS HALLAZGOS CAEN, NO SOLO LOS DEL PARRAFO BORRADO', () => {
  // Review Focus #1, y la razon de ser de esta tarea entera. elem_7 todavia
  // existe, pero ya no es el mismo parrafo. Parchar por id dejaria un hallazgo
  // pegado al parrafo equivocado, con el subrayado en la frase equivocada: un
  // error que se lee como error de redaccion y no como error de la app.
  montarConHallazgos([{ element_id: 'elem_7', kind: 'ortografia' }]);
  invalidarHallazgosRancios();
  expect(collectAuditItems(fuentes()).length).toBe(0);
});
```

- [ ] **Step 2: Corré el test y verificá que falla**

Run: `npx vitest run src/__tests__/hallazgosRancios.test.ts`
Expected: FAIL — no existe `invalidarHallazgosRancios`.

- [ ] **Step 3: Implementá la invalidación**

```ts
invalidarHallazgosRancios: () => {
  set({
    proofreadFindings: [],
    reviewResult: null,
    citationAuditResult: null,
    aiIndices: null,
    // Los descartes son claves que incluyen element_id, asi que tambien
    // quedan rancios: un descarte de "elem_7" no puede seguir borrando el
    // hallazgo nuevo de un parrafo que ahora ocupa ese id.
    dismissedCommentIds: [],
  });
  // wordapa7_marcas_map esta indexado por element_id y NO tiene poda en ningun
  // lado (auditSlice.ts:152-156 solo agrega). Es la misma trampa que los
  // hallazgos: hay que vaciarlo, no podarlo.
  try { localStorage.removeItem('wordapa7_marcas_map'); } catch { /* noop */ }
},
```

- [ ] **Step 4: Corré el test y el type-check**

Run: `npx vitest run src/__tests__/hallazgosRancios.test.ts && npx tsc --noEmit`
Expected: PASS / sin salida

- [ ] **Step 5: Corré la suite del frontend**

Run: `npx vitest run`
Expected: 2 fallos, los de `ExportView.tsx` en `noHardcodedColors` (otra sesión, ya
residualizados). Todo lo demás verde.

- [ ] **Step 6: Commiteá**

```bash
git add src/store/slices/auditSlice.ts src/store/types.ts src/__tests__/hallazgosRancios.test.ts
git commit -m "refresh: los hallazgos rancios caen TODOS, no solo los del parrafo borrado

element_id es un indice posicional (docx_parser.py:1099), asi que insertar un
parrafo arriba en Word corre todos los ids de abajo con el mismo texto. Parchar
por id dejaria un hallazgo pegado al parrafo equivocado, con el subrayado en la
frase equivocada: un error que se lee como error de redaccion.

Tambien cae wordapa7_marcas_map, que esta indexado por element_id y no tiene
poda en ningun lado, y dismissedCommentIds, cuyas claves incluyen element_id."
```

---

### Task 4: Re-correr los motores, y que el aviso diga lo que pasó

**Files:**
- Modify: `src/App.tsx:263-291` (el watcher)
- Test: `src/__tests__/watcherAudita.test.tsx`

**Interfaces:**
- Consumes: `refrescarDesdeWord` (Task 2), `invalidarHallazgosRancios` (Task 3),
  `runProofreadBatch` / `runCitationAudit` (existen en `auditSlice.ts:128` y
  `documentSlice.ts:845`), `crearRefrescador` (`src/lib/wordRefresh.ts`).
- Produces: `crearRefrescador` gana una dep `alRefrescar?: (r) => MensajeRefresco | null`.

- [ ] **Step 1: Escribí el test que falla**

```ts
it('EL AVISO DICE LO QUE LA REAUDITORIA ENCONTRO, NO LO QUE EL DIFF SUPONIA', async () => {
  // El diff dice "3 parrafos nuevos". Si la reauditoria sobre el documento
  // entero encuentra 11 hallazgos, el aviso tiene que decir 11: 3 es la
  // respuesta a otra pregunta, y mezclarlas es la misma mentira que ya se
  // elimino del watcher.
  const avisar = vi.fn();
  pedir.mockResolvedValue(diff({ cambiado: true, ids_nuevos: ['a','b','c'] }));
  runProofreadBatch.mockResolvedValue(undefined);
  get().proofreadFindings = Array.from({ length: 11 }, (_, i) => mkFinding(`e${i}`));

  await refrescar();
  expect(avisar.mock.calls[0][0]).toContain('11');
  expect(avisar.mock.calls[0][0]).not.toContain('3');
});

it('UN ARCHIVO A MEDIAS NO REAUDITA NADA', async () => {
  pedir.mockResolvedValue(diff({ listo: false }));
  await refrescar();
  expect(runProofreadBatch).not.toHaveBeenCalled();
  expect(invalidarHallazgosRancios).not.toHaveBeenCalled();
});

it('SI LA RECARGA FALLA, LOS HALLAZGOS VIEJOS SE QUEDAN', async () => {
  // Review Focus #3. Es preferible un hallazgo viejo a una pantalla vacia sin
  // aviso: uno se nota y se corrige, el otro parece que la app perdio el
  // documento.
  recoverSession.mockRejectedValue(new Error('ECONNREFUSED'));
  await refrescar();
  expect(invalidarHallazgosRancios).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Corré el test y verificá que falla**

Run: `npx vitest run src/__tests__/watcherAudita.test.tsx`
Expected: FAIL — `crearRefrescador` no tiene `alRefrescar`, y el watcher no re-audita.

- [ ] **Step 3: Implementá el cierre del ciclo**

En `crearRefrescador`, después de `deps.pedir` y antes de avisar, y SOLO si
`diff.cambiado`:

```ts
      if (diff.cambiado && deps.alRefrescar) {
        const resumen = await deps.alRefrescar(diff);
        const propio = deps.alRefrescar ? mensajeDeReauditoria(resumen, nombreDe(ruta)) : null;
        if (propio) { deps.avisar(propio.texto, propio.tipo); return; }
      }
```

Y en `App.tsx`, reemplazar el callback del watcher:

```tsx
      alRefrescar: async (d) => {
        const st = useDocStore.getState();
        let recargado;
        try {
          recargado = await st.refrescarDesdeWord(activeFilePath);
        } catch {
          return null;   // los hallazgos viejos se quedan; ya se explico por que
        }
        st.invalidarHallazgosRancios();
        await Promise.all([
          st.runProofreadBatch(),
          st.runCitationAudit().catch(() => {}),
        ]);
        return { ...recargado, hallazgos: useDocStore.getState().proofreadFindings.length };
      },
```

`migrateDocument` va adentro de `refrescarDesdeWord`, no acá: la acción del store
es la que sabe qué hay que migrar.

- [ ] **Step 4: Corré los tests y type-chequeá**

Run: `npx vitest run src/__tests__/watcherAudita.test.tsx src/__tests__/wordRefresh.test.ts && npx tsc --noEmit`
Expected: PASS / sin salida

- [ ] **Step 5: Corré todo y commiteá**

Run: `npx vitest run && pytest python/tests/ -q`
Expected: 2 fallos residualizados (`ExportView.tsx`); backend todo verde.

```bash
git add src/App.tsx src/lib/wordRefresh.ts src/__tests__/watcherAudita.test.tsx
git commit -m "refresh: el watcher re-audita y el aviso cuenta lo que se encontro

Cierra el ciclo. El endpoint ya guardaba el documento reparseado, asi que hasta
aca el backend tenia el texto nuevo y la pantalla el viejo: el aviso era cierto
y la app no.

El numero que se dice es el que la reauditoria ENCONTRO, no el que el diff
suponia. 3 parrafos nuevos es la respuesta a otra pregunta, y mezclarlas es
la misma mentira que ya se elimino del watcher."
```

---

## Lo que este plan NO arregla

- **`openSession` no corre ninguna auditoría** (`documentSlice.ts:302`): al reabrir
  una sesión, los hallazgos quedan vacíos hasta que la persona escanea a mano.
  Es el mismo problema por otra puerta y merece su propia tarea.
- **`/api/ai-review` degrada los hallazgos**: `main.py:2605-2610` fusiona los del
  auditor proactivo dentro de `paragraphs[].findings` y pierde `start`, `end`,
  `phase` y `read_only`. Eso rompe el requisito de AGENTS.md de que el hallazgo
  llegue igual a los dos canales.
- **Las claves de proveedor están en texto plano** en `localStorage` y en
  `storage/ai_keys.json`.
- **Los hallazgos no se persisten**: viajan por HTTP y se pierden al recargar
  (salvo `element.ai_findings`). Por eso reabrir una sesión sale en blanco.
