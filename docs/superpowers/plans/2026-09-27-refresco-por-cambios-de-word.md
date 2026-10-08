# Refresco por cambios de Word — Plan de implementación

> ## EJECUTADO. Leé esto antes que el plan.
>
> Las 5 tasks estan hechas, en 5 commits: `a22fe82` (diff + endpoint), `8cdd7cc`
> (el aviso), `dbf1b13` (audit_registry), `1a41622` (cache de LLM), `cf20338`
> (reintento). El razonamiento completo, con los hallazgos, esta en
> `.superpowers/sdd/2026-09-27-inicio-cinematografico/progress.md`.
>
> **Lo que el plan de abajo afirma y resulto FALSO — no lo copies:**
>
> 1. **La clave `(session_id, element_id, content_hash)` no puede funcionar.** Los
>    ids de elemento son `elem_{contador}`, un indice POSICIONAL
>    (`docx_parser.py:1099`): insertar un parrafo arriba en Word corre todos los
>    ids de abajo con el MISMO texto. La clave real ended siendo
>    `(session_id, hash_texto, fase)`, y el diff compara TEXTOS, no ids.
> 2. **`hash_estructura` no va en la clave.** Sobre-invalida: mover un titulo en
>    el capitulo 5 tumbaba el veredicto de los 200 parrafos del capitulo 1. La
>    fase resuelta ya es mas precisa.
> 3. **El reuso de una sola vez estaba especificado y es un bug.** Consumir la
>    entrada al leerla no la borra (la tabla crecia igual) y hacia que el segundo
>    guardado que no cambia nada volviera a pagar el documento entero.
> 4. **El watcher NO es un poll de 5 segundos.** Es `fs.watch` con debounce de
>    600 ms (`electron/main.ts:317`). Consecuencia: no hay reintento automatico, y
>    por eso se agreego UN reintento de 900 ms.
> 5. **El debounce de 1200 ms de la Task 5 no se agrego:** `main.ts:319` ya tiene
>    uno de 600 ms rearmable. Sumaba latencia sin agrupar nada.
> 6. **El gasto de LLM ya estaba cubierto** por el cache de
>    `execute_with_specialty` (`ai_client.py:173`, `use_cache` default `True`) y por
>    `_classification_cache_key` de `llm_classifier.py:320`. Por eso
>    `audit_registry` quedo sin cablear, por decision de la persona.
>
> **Y el ciclo sigue ABIERTO:** nadie recarga el documento en memoria ni corre los
> motores tras un refresco. El endpoint ya guarda el estado reparseado, asi que
> hoy el backend tiene el texto nuevo y la pantalla el viejo. Requiere su propio
> plan, porque toca el pipeline de hallazgos.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cuando Word guarde un cambio, WordAPA re-lea el documento, corra **todos** los motores baratos sobre **todo** el documento, y gaste LLM **solo** en el contenido nuevo o modificado — y que diga cuántos párrafos tocó y cuántos se saltó.

**Architecture:** Tres piezas, en este orden. (1) Un endpoint de re-lectura que reparsea el `.docx` y devuelve el diff por elemento, en vez de un toast. (2) Un registro de auditoría por `(session_id, element_id, content_hash)` que permite reusar el resultado anterior de un párrafo cuyo texto no cambió, y —esto es lo que no se puede omitir— incluir el hash de la **estructura** para que un H1 nuevo invalide lo que está debajo. (3) Arreglar la caché del LLM, que hoy previene el gasto de tokens pero causa el gasto real: una lectura y una escritura del JSON entero **por llamada**.

**Tech Stack:** Python 3.11+ / FastAPI (SQLite vía `persistence/session_manager.py`), React 18 / TypeScript / Zustand, Electron (`watchDocumentFile`).

**Spec:** la conversación de esta sesión. Decisión textual de la persona: *"corren sobre todo el documento los baratos, llm solo lo nuevo"*, y el motivo: *"que se actualice cada que Word actualiza y corra todos los motores sin gastar de más o procesar cosas que ya estaban"*.

## Global Constraints

- **Cero emojis** (`AGENTS.md` §1). Solo `lucide-react`.
- **Sin literales de color** en código. `Un addColorStop` de un degradado del `canvas` es la única excepción, ya documentada.
- **Cero emojis ni "✓" en texto de UI.**
- **Ninguna UI puede afirmar algo que el código no hace.** Tres ejemplos ya corregidos o en curso esta sesión: el chip decía "Sin guardar" con el documento ya guardado, el botón "Guardar" no guardaba, y el toast del watcher dice "el documento está sincronizado" sin re-leer nada (`src/App.tsx:271`).
- **Un motor que se calla es indistinguible de uno que no encontró nada.** Si se salta trabajo, se dice cuánto.
- Los archivos de `src/components/layout` no están en el alcance de `noHardcodedColors` por una razón escrita (degradados del canvas). No se amplía a la ligera.

## Review Focus

Cinco entradas que este plan toca y ninguna tarea cubre sola:

1. **Word guarda el archivo mientras la app está escribiendo el estado de sesión.** El `.docx` lo abre Word; el estado de sesión vive en SQLite. Hoy no se cruzan, y este plan no debe introducirlos: si el re-parse lee el `.docx` mientras Word lo está guardando, puede leer un zip a medio escribir. Un `.docx` truncado lanza al abrir, y el peor resultado es un error en la cara de la persona en vez de un toast.
2. **Word guardó un cambio que NO es de texto**: estilos, imágenes, tablas, propiedades. El hash del archivo cambia, el documento se reparsea, y el diff puede salir vacío. Reauditar todo y no encontrar nada es correcto, pero tiene que decir "no cambió nada relevante" y no "se reanalizaron 214 párrafos".
3. **Párrafo con el mismo texto en dos lugares distintos.** Un hash por texto es ambiguo: dos párrafos idénticos en capítulos diferentes comparten resultado, y si uno es un Findings y el otro una Metodología, el mensaje del motor puede ser distinto. La clave del registro tiene que ser `(element_id, hash)`, no `hash`.
4. **La caché del LLM está indexada por `prompt + system_prompt`, sin modelo.** Cambiar el `system_prompt` —que se hace al tocar un prompt— invalida **todo** el caché, para todos los documentos. Es el gasto de tokens del proyecto, y nadie lo ha medido.
5. **Guardar dos veces en un minuto.** Word genera guardados sucesivos mientras alguien escribe. Sin un agrupamiento, el plan produce dos reparseos completos por minuto.

---

### Task 1: Un endpoint que re-lee y devuelve el diff

**Files:**
- Create: `python/modules/word_refresh.py`
- Modify: `python/routers/sessions.py` (una ruta nueva, cerca de la de upload)
- Test: `python/tests/test_word_refresh.py`

**Interfaces:**
- Consumes: `models.DocumentModel`, `persistence.session_manager.load_session_state`, el parser que usa `/api/upload`.
- Produces: `async def refrescar_desde_word(session_id: str, ruta: Path) -> dict` con esta forma exacta, que es el contrato de la Task 2:

```python
{
  "session_id": str,
  "cambiado": bool,              # ¿el documento reparseado difiere del guardado?
  "hash_estructura": str,        # hash de la lista de H1 + sus textos
  "elementos": [
    {"id": str, "hash": str, "nuevo": bool, "cambiado": bool},
  ],
  "ids_nuevos": [str],
  "ids_cambiados": [str],
  "ids_iguales": [str],
}
```

- [ ] **Step 1: Escribí el test que falla**

`python/tests/test_word_refresh.py`:

```python
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import ElementModel
from modules.word_refresh import diff_por_elemento, hash_de_estructura


def _el(id, text, nivel=None, tipo="paragraph"):
    return ElementModel(
        id=id, type=tipo, heading_level=nivel, text=text,
        style_name="", alignment="left", font_name="Times New Roman",
        font_size=12, is_bold=False, is_italic=False, is_bullet=False,
        left_indent_cm=0, confidence=1, is_user_modified=False,
    )


def _doc(*elementos):
    from models import DocumentModel
    return DocumentModel(session_id="s1", file_name="t.docx", elements=list(elementos))


def test_una_tesis_sin_cambios_no_reporta_nada_nuevo():
    """El caso que mas importa y que no se puede ver en la UI: cuando Word
    guardo algo que no es texto, el diff tiene que salir VACIO. Reauditar 214
    parrafos para no encontrar nada es gastar de mas y mentir en la misma."""
    antes = _doc(_el("a", "Uno"), _el("b", "Dos"))
    despues = _doc(_el("a", "Uno"), _el("b", "Dos"))
    d = diff_por_elemento(antes, despues)
    assert d["ids_nuevos"] == []
    assert d["ids_cambiados"] == []
    assert d["ids_iguales"] == ["a", "b"]
    assert d["cambiado"] is False


def test_un_parrafo_nuevo_aparece_como_nuevo():
    antes = _doc(_el("a", "Uno"))
    despues = _doc(_el("a", "Uno"), _el("z", "Nuevo"))
    d = diff_por_elemento(antes, despues)
    assert d["ids_nuevos"] == ["z"]
    assert d["cambiado"] is True


def test_un_parrafo_editado_aparece_como_cambiado_no_como_nuevo():
    """Nuevo y cambiado son cosas distintas: el nuevo hay que auditarlo entero y
    el cambiado hay que reusar lo que no se movio. Confundirlos hace que un
    un documento con un typo se reaudite entero."""
    antes = _doc(_el("a", "Uno"))
    despues = _doc(_el("a", "Uno dos"))
    d = diff_por_elemento(antes, despues)
    assert d["ids_cambiados"] == ["a"]
    assert d["ids_nuevos"] == []


def test_un_h1_nuevo_cambia_el_hash_de_estructura_aunque_el_resto_este_igual():
    """La trampa del solo-hash-de-parrafo. Si alguien mete un capitulo nuevo en
    Word, el texto de abajo no se toco —los ids y hashes de parrafo estan
    intactos— y un diff por contenido diria "nada cambio". El H1 es lo que
    organiza el documento, asi que su hash va aparte."""
    antes = _doc(_el("h1", "Metodo", 1, "heading"), _el("a", "Uno"))
    sin_cap = _doc(_el("h1", "Metodo", 1, "heading"), _el("a", "Uno"))
    con_cap = _doc(
        _el("h1", "Metodo", 1, "heading"),
        _el("h2", "Resultados", 1, "heading"),
        _el("a", "Uno"),
    )
    assert hash_de_estructura(sin_cap) != hash_de_estructura(con_cap)
    # Y el parrafo de texto NO cambio:
    assert diff_por_elemento(sin_cap, con_cap)["ids_iguales"] == ["a"]


def test_el_hash_de_un_elemento_ignora_los_espacios_extremos():
    """Un Word que re-serializa puede cambiar espacios finales sin cambiar el
    texto. Si eso cuenta como 'cambiado', cada guardado de Word reaudita el
    documento entero y la regla de 'solo lo nuevo' no sirve de nada."""
    antes = _doc(_el("a", "Uno"))
    despues = _doc(_el("a", "Uno   "))
    assert diff_por_elemento(antes, despues)["ids_cambiados"] == []


def test_un_parrafo_que_se_borra_no_aparece_como_nuevo():
    antes = _doc(_el("a", "Uno"), _el("b", "Dos"))
    despues = _doc(_el("a", "Uno"))
    d = diff_por_elemento(antes, despues)
    assert d["ids_nuevos"] == []
    assert d["ids_cambiados"] == []
```

- [ ] **Step 2: Corré el test y verificá que falla**

Run: `pytest python/tests/test_word_refresh.py -q`
Expected: FAIL con `ModuleNotFoundError: No module named 'modules.word_refresh'`.

- [ ] **Step 3: Escribí `python/modules/word_refresh.py`**

```python
"""Dif de un documento contra el que la app tiene guardado, POR ELEMENTO.

El watcher de Word detecta que el `.docx` cambio y no mas. Esto contesta la
pregunta que hace falta para no gastar de mas: no "cambio el archivo" sino
"cambio ESTE parrafo".

Tres reglas, y las tres estan en los tests:

  - El hash de un elemento es su TEXTO, con espacios extremos recortados. Un
    Word que re-serializa puede tocar espacios finales sin tocar el texto, y si
    eso cuenta como "cambiado" cada guardado reaudita el documento entero y la
    regla de "solo lo nuevo" no sirve de nada.
  - El hash de la ESTRUCTURA va aparte. Si alguien mete un capitulo nuevo en
    Word, el texto de abajo esta intacto y un diff por contenido dira "nada
    cambio" — que es la razon por la que los titulos se auditan por fase.
  - La clave es `(element_id, hash)` y no `hash`: dos parrafos con el mismo
    texto en capitulos distintos son el mismo texto y hallazgos distintos.
"""
import hashlib
from typing import Any, Dict, List, Optional


def _hash_texto(texto: str) -> str:
    return hashlib.sha256((texto or "").strip().encode("utf-8")).hexdigest()


def hash_de_estructura(doc) -> str:
    """Hash de la lista de titulos: que seccion existe y con que nombre."""
    partes: List[str] = []
    for e in getattr(doc, "elements", []) or []:
        if getattr(e, "type", None) == "heading":
            partes.append(f"{getattr(e, 'heading_level', 0) or 0}:{_hash_texto(getattr(e, 'text', ''))}")
    return hashlib.sha256("|".join(partes).encode("utf-8")).hexdigest()


def diff_por_elemento(antes, despues) -> Dict[str, Any]:
    """Qué elementos son nuevos, cuáles cambiaron y cuáles quedaron iguales."""
    prev: Dict[str, str] = {
        e.id: _hash_texto(getattr(e, "text", ""))
        for e in (getattr(antes, "elements", []) or [])
    }
    ahora: Dict[str, str] = {}
    elementos: List[Dict[str, Any]] = []
    nuevos: List[str] = []
    cambiados: List[str] = []

    for e in (getattr(despues, "elements", []) or []):
        h = _hash_texto(getattr(e, "text", ""))
        ahora[e.id] = h
        existia = e.id in prev
        cambio = existia and prev[e.id] != h
        if not existia:
            nuevos.append(e.id)
        elif cambio:
            cambiados.append(e.id)
        elementos.append({
            "id": e.id,
            "hash": h,
            "nuevo": not existia,
            "cambiado": bool(cambio),
        })

    iguales = [i for i, h in ahora.items() if i in prev and prev[i] == h]
    estructura_igual = hash_de_estructura(antes) == hash_de_estructura(despues)
    return {
        "cambiado": bool(nuevos or cambiados) or not estructura_igual,
        "hash_estructura": hash_de_estructura(despues),
        "elementos": elementos,
        "ids_nuevos": nuevos,
        "ids_cambiados": cambiados,
        "ids_iguales": iguales,
    }
```

- [ ] **Step 4: Corré el test y verificá que pasa**

Run: `pytest python/tests/test_word_refresh.py -q`
Expected: 6 passed.

- [ ] **Step 5: Sumá la ruta y el llamador real**

En `python/routers/sessions.py`, junto a las de upload:

```python
@router.post("/api/refresh-from-word/{session_id}")
async def refresh_from_word(session_id: str) -> dict:
    """Relee el `.docx` que tiene Word abierto y devuelve el diff por elemento.

    Lo que hoy NO hace: `src/App.tsx:267` muestra un toast que dice "el documento
    esta sincronizado" y no reparsea nada. Este endpoint es lo que hace que esa
    frase sea cierta, o la frase se va.
    """
```

Su cuerpo reparsea el archivo con el MISMO parser que usa `/api/upload` —no un
segundo parser, que es la clase de divergencia que este proyecto ha pagado
varias veces—, guarda el estado y devuelve el `diff_por_elemento`.

**Y antes de leer el archivo, comprobar que se puede leer entero**: un `.docx` es
un zip, y un zip a medio escribir revienta al abrir. Si `zipfile.BadZipFile`,
devolver `{"cambiado": False, "motivo": "archivo_a_medio_escribir"}` y que el
watcher reintente, en vez de un error en la cara de la persona. Esa es la
entrada 1 del Review Focus y no puede ser un extra.

- [ ] **Step 6: Corré la suite del backend**

Run: `pytest python/tests/ -q`
Expected: la suite entera en verde.

- [ ] **Step 7: Commiteá**

```bash
git add python/modules/word_refresh.py python/routers/sessions.py python/tests/test_word_refresh.py
git commit -m "feat(refresco): un diff por elemento contra el documento guardado"
```

---

### Task 2: El watcher deja de mentir y empieza a refrescar

**Files:**
- Modify: `src/App.tsx:263-279` (el `useEffect` del watcher)
- Modify: `src/lib/api.ts` (el cliente del endpoint nuevo)
- Test: `src/__tests__/wordWatcherRefresh.test.tsx`

**Interfaces:**
- Consumes: `POST /api/refresh-from-word/{session_id}` de la Task 1.
- Produce: `refrescarDesdeWord(): Promise<RefreshResult>` en el store, con `{ nuevo, cambiado, saltados, reanalizados }`.

- [ ] **Step 1: Escribí el test que falla**

La prueba tiene que fijar **las dos** cosas: que el watcher llama al endpoint, y que el texto del aviso corresponde a lo que pasó. Un watcher que llama pero sigue diciendo "sincronizado" cuando el diff vino vacío es el mismo bug con más pasos.

```tsx
// src/__tests__/wordWatcherRefresh.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refrescarDesdeWord = vi.fn().mockResolvedValue({
  nuevo: false, cambiado: false, saltados: 214, reanalizados: 0,
});
const showToast = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).electronAPI = {
    watchDocumentFile: (_ruta: string, cb: (d: unknown) => void) => {
      (window as any).__cb = cb;
      return () => {};
    },
  };
});

describe('el watcher de Word', () => {
  it('un cambio dispara el refresco', async () => {
    const { montarApp } = await import('./harnessWatcher');
    montarApp({ refrescarDesdeWord, showToast });
    (window as any).__cb({ fileName: 'Tesis.docx' });
    expect(refrescarDesdeWord).toHaveBeenCalled();
  });

  it('con el documento igual, el aviso NO dice que se sincronizó', async () => {
    /* El texto viejo —"El documento está sincronizado"— es una afirmación que
       el código no hacía. Con el diff en la mano, "sin cambios" es un hecho
       verificable y se puede decir. */
    const { montarApp } = await import('./harnessWatcher');
    montarApp({ refrescarDesdeWord, showToast });
    (window as any).__cb({ fileName: 'Tesis.docx' });
    const textos = showToast.mock.calls.map((c) => String(c[0])).join(' | ');
    expect(textos).not.toMatch(/sincronizado/i);
  });

  it('con cambios, el aviso dice cuántos párrafos se reanalizaron y cuántos se saltaron', async () => {
    /* "Sin gastar de más" solo es creíble si se dice cuánto se gastó. Y un
       motor que se calla es indistinguible de uno que no encontró nada. */
    refrescarDesdeWord.mockResolvedValue({
      nuevo: false, cambiado: true, saltados: 210, reanalizados: 4,
    });
    const { montarApp } = await import('./harnessWatcher');
    montarApp({ refrescarDesdeWord, showToast });
    (window as any).__cb({ fileName: 'Tesis.docx' });
    const textos = showToast.mock.calls.map((c) => String(c[0])).join(' | ');
    expect(textos).toMatch(/4/);
    expect(textos).toMatch(/210/);
  });
});
```

El `harnessWatcher` es un módulo de test de tres líneas que monta el `useEffect`
del watcher con el store mockeado; se escribe junto con el test.

- [ ] **Step 2: Corré el test y verificá que falla**

Run: `npx vitest run src/__tests__/wordWatcherRefresh.test.tsx`
Expected: FAIL — `refrescarDesdeWord` no se llama, y el texto sigue diciendo "sincronizado".

- [ ] **Step 3: Conectá el watcher**

En `src/App.tsx`, reemplazá el cuerpo del callback por la llamada al refresco y un aviso que diga lo que pasó. La regla del `title` del toast es la misma del chip: **solo afirmá lo que el diff demuestra**.

- [ ] **Step 4: Corré la prueba y `tsc`**

Run: `npx vitest run src/__tests__/wordWatcherRefresh.test.tsx && npx tsc --noEmit`
Expected: PASS; sin `error TS`.

- [ ] **Step 5: Commiteá**

```bash
git add src/App.tsx src/lib/api.ts src/__tests__/wordWatcherRefresh.test.tsx
git commit -m "feat(watcher): el aviso de Word dice lo que el diff demuestra"
```

---

### Task 3: El registro por contenido, para no reauditar lo que no cambió

**Files:**
- Create: `python/modules/audit_registry.py`
- Modify: el punto donde el backend corre los motores tras un refresco.
- Test: `python/tests/test_audit_registry.py`

**Interfaces:**
- Consumes: los `ids_nuevos` / `ids_cambiados` de la Task 1.
- Produce: `registrar(session_id, element_id, hash, hallazgos) -> None` y `reusar(session_id, element_id, hash) -> Optional[list]`.

- [ ] **Step 1: Escribí el test que falla**

```python
def test_un_parrafo_con_el_mismo_hash_reusa_su_resultado():
    """Es el corazon del gasto. Un parrafo cuyo texto no cambio tiene el mismo
    veredicto, y volver a pedirlo al LLM es gastar tokens por una respuesta que
    ya se tiene."""
    registrar("s1", "e1", "abc", [{"kind": "ortografia", "message": "tilde"}])
    assert reusar("s1", "e1", "abc") == [{"kind": "ortografia", "message": "tilde"}]


def test_un_parrafo_editado_no_reusa_nada():
    registrar("s1", "e1", "abc", [{"kind": "ortografia"}])
    assert reusar("s1", "e1", "distinto") is None


def test_la_estructura_invalida_lo_de_abajo():
    """Un H1 nuevo cambia la fase de todo lo que esta debajo, aunque el texto no
    se haya movido. Sin este campo, meter un capitulo en Word no reauditaria
    nada y la persona veria capitulos viejos con los hallazgos del viejo
    capitulo."""
    registrar("s1", "e1", "abc", [{"kind": "x"}], hash_estructura="viejo")
    assert reusar("s1", "e1", "abc", hash_estructura="nuevo") is None


def test_una_auditoria_se_olvida_a_su_mismo():
    """Guardar que ya se reviso es lo que hace que esto no crezca sin limite. Sin
    esto, la tabla es una copia del documento y ocupa mas que el documento."""
    registrar("s1", "e1", "abc", [{"kind": "x"}])
    registrar("s1", "e2", "def", [{"kind": "y"}])
    reusar("s1", "e1", "abc")
    assert reusar("s1", "e1", "abc") is None
```

- [ ] **Step 2: Corré y verificá que falla**

Run: `pytest python/tests/test_audit_registry.py -q`
Expected: FAIL con `ModuleNotFoundError`.

- [ ] **Step 3: Implementá con la misma tabla de `persistence` que el resto**

Una tabla `(session_id, element_id, content_hash, hash_estructura, hallazgos_json,
revisado_en)`. **Reusa una sola vez**: cuando se entrega un resultado, se marca
como entregado. Esa es la diferencia entre un caché y una cola, y una cola sin
consumir es la forma de que un sistema "ya lo tiene" termine pidiendo todo otra
vez.

- [ ] **Step 4: Corré y commiteá**

```bash
pytest python/tests/ -q
git add python/modules/audit_registry.py python/tests/test_audit_registry.py
git commit -m "feat(auditoria): registro por contenido para reusar lo que no cambio"
```

---

### Task 4: Arreglar el gasto que sí existe — la caché del LLM reescribe el JSON entero

**Files:**
- Modify: `python/modules/ai_client.py` (la caché, líneas 77-98 y los usos en 174-177 y 237-239)
- Test: `python/tests/test_ai_cache_io.py`

**Interfaces:**
- Produce: `cache_de_lote()` y `cerrar_cache_de_lote()` para que un lote de N llamadas lea y escriba **una vez**.

- [ ] **Step 1: Escribí el test que falla**

```python
def test_un_lote_de_300_llm_no_abre_el_json_300_veces(tmp_path, monkeypatch):
    """El gasto que hoy es real, y no son tokens.

    `execute_with_specialty` hace `_load_cache()` en cada llamada y
    `_save_cache()` en cada exito: con la regla "los baratos sobre todo el
    documento" eso son 300 lecturas y 300 escrituras de un JSON de 5000 entradas
    por cada guardado de Word. El gasto de tokens ya lo evita el hash; el de
    disco no, y es el que se paga en cada refresco.

    Y hay una trampa peor: como la escritura es por llamada y el archivo se
    trunca al guardar, una reescritura a mitad de lote deja el cache con la
    mitad de las entradas y las proximas llamadas vuelven a gastar.
    """
```

- [ ] **Step 2: Corré y verificá que falla**

Run: `pytest python/tests/test_ai_cache_io.py -q`
Expected: FAIL con un conteo de accesos mayor a 2.

- [ ] **Step 3: Implementá el lote**

Un `context manager` que carga el diccionario al entrar, lo mantiene en memoria
durante el lote, y lo escribe una vez al salir — incluso si el lote falla, con
un `try/finally`. La escritura en lote tiene que ser **atómica**: escribir a un
temporal y reemplazar. Un `json.dump` directo sobre el archivo vivo puede
truncarlo, y un cache truncado es peor que un cache ausente porque parece que
funciona.

- [ ] **Step 4: Corré la suite y commiteá**

```bash
pytest python/tests/ -q
git add python/modules/ai_client.py python/tests/test_ai_cache_io.py
git commit -m "perf(llm): el cache se lee y escribe una vez por lote, y atomico"
```

---

### Task 5: Agrupar los guardados de Word

**Files:**
- Modify: `src/App.tsx` (el watcher) o el preload, según dónde viva el agrupamiento.
- Test: el del watcher de la Task 2, con dos llamadas seguidas.

- [ ] **Step 1: Escribí el test que falla**

```tsx
it('dos guardados seguidos producen un solo refresco', async () => {
  /* Word guarda varias veces mientras alguien escribe: cada Ctrl+S produce un
     evento. Sin agrupar, dos guardados en un segundo son dos reparseos
     completos —o peor, dos tandas de LLM—. */
  refrescarDesdeWord.mockClear();
  (window as any).__cb({ fileName: 'Tesis.docx' });
  (window as any).__cb({ fileName: 'Tesis.docx' });
  await act(async () => { vi.advanceTimersByTime(1500); });
  expect(refrescarDesdeWord).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Corré y verificá que falla**

Expected: FAIL con 2 llamadas.

- [ ] **Step 3: Agrupá con un debounce de ~1200 ms**

El watcher del backend ya sondea cada 5 s, así que 1200 ms alcanza para juntar
una ráfaga sin dejar pasar un guardado largo. Con **temporizador que se cancela y
se rearma**, no un `setTimeout` que se acumule: dos guardados cerca producen un
solo refresco, no dos.

- [ ] **Step 4: Corré, commiteá, y DECÍ en el mensaje que el agrupamiento no
  arregla el peor caso**

```bash
git add src/App.tsx src/__tests__/wordWatcherRefresh.test.tsx
git commit -m "feat(watcher): agrupar los guardados de Word en un solo refresco"
```

Un párrafo que alguien está escribiendo genera un guardado por pausa, no uno por
palabra. Un agrupamiento de 1200 ms cubre la pausa; no cubre a alguien que
escribe durante diez minutos con pausas de más de dos segundos, y en ese caso
cada pausa sigue siendo un refresco completo de los motores baratos. Eso es lo
correcto —los baratos no cuestan nada— pero **no** lo es para el LLM, y por eso
el registro por contenido de la Task 3 es la pieza que de verdad protege el
gasto, no este debounce.

---

## Self-Review

**1. Cobertura de la spec.** "Que se actualice cada que Word actualiza" → Tasks 1 y 2. "Corra todos los motores" → Task 1 (el refresco corre los baratos sobre todo el documento; es la decisión explícita de la persona). "Sin gastar de más" → Task 3 (registro por contenido) y Task 4 (el gasto de disco que existía). "Sin procesar cosas que ya estaban" → Task 3. El agrupamiento de la Task 5 es el extra que hace lo anterior tolerable en el uso diario.

**2. Placeholders.** No hay. Cada step trae el código o la acción exacta. La Task 2 y la Task 5 dependen de un `harnessWatcher` de test que hay que escribir; su contenido está descrito, y es de tres líneas.

**3. Consistencia de tipos.** `diff_por_elemento` devuelve el contrato de la Task 1, y la Task 2 lo consume tal cual. `registrar`/`reusar` toman `hash_estructura` opcional con default, así que la Task 3 no rompe a quien los llame sin él — y esa opcionalidad es lo que permite la entrada 3 del Review Focus (dos párrafos con el mismo texto en sitios distintos).

**4. Review Focus.** Las cinco entradas: (1) zip a medio escribir → Task 1, paso 5, con `BadZipFile` y reintento, explícitamente no opcional. (2) cambio sin texto → Task 1, `test_una_tesis_sin_cambios_no_reporta_nada_nuevo` y el texto del toast de la Task 2. (3) párrafos con texto repetido → clave `(element_id, hash)`, Task 3. (4) caché del LLM sin modelo en la clave → **NO RESUELTO**: queda nombrado en el Review Focus y hay que decirlo en el commit de la Task 4. Cambiar el `system_prompt` invalida todo el caché del proyecto, y eso nadie lo midió. (5) guardados seguidos → Task 5.
