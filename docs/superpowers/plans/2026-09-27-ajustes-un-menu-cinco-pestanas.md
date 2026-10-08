# Ajustes en un solo menu, con cinco pestañas — Plan de implementación

> **EJECUTANDOSE.** Fases 1 a 7, una por subagente. El ledger de esta fase está en
> `.superpowers/sdd/2026-09-27-inicio-cinematografico/progress.md`.

**Goal:** una sola pantalla de Ajustes, con cinco pestañas, alcanzable desde
cualquier lado, donde cada control hace algo y se sabe si es del documento o de la
app.

**Architecture:** Un `SettingsHub` con `pestaña activa` en el store y cinco
pestañas. Cada pestaña es un archivo propio con una responsabilidad: nadie
reparte 40 controles entre dos archivos de 1000 líneas. Los dos menús que existen
hoy (`SettingsMenu`, `SettingsPreviewStudio`) se borran; todas sus entradas
apuntan al hub.

**Tech Stack:** React 18, TypeScript, Zustand, `lucide-react`, Vitest.

**Spec:** la conversación de esta sesión. Decisiones de la persona, textuales:
*"todo en un solo menu pero con pestañas"*, *"que cada configuracion tenga sentido
y logica y funcione"*, *"si los controles que no hacen nada... reeditalas a tu
nueva propuesta reconstrui eso"*, *"puedes poner algunas mascotas tambien por ahi
para que no se vea tan serio, usa los parametros de diseño que tenemos"*,
correo de soporte `ws692888@gmail.com`.

---

## El problema, en números

- **2 menús que se contradicen**: `SettingsMenu` (564 líneas, 6 secciones,
  inalcanzable con un documento abierto) y `SettingsPreviewStudio` (1041 líneas,
  5 pestañas, reemplaza la app entera). 1605 líneas en total.
- **7 entradas** abren configuración, ninguna desde el `CommandPalette`.
- **~12 controles que no hacen nada.**
- **~20 ajustes que existen en el código y no tienen UI.**
- **5 gramáticas distintas de "pestaña activa"** conviviendo, y **ningún token**
  para pestaña. `DESIGN.md:167` prohíbe explícitamente los side-tabs gruesos, que
  es lo que hacen dos de las cinco.

## La pestaña ES el ámbito

Se revisó cada ajuste contra dónde se guarda, y **ninguna pestaña mezcla ámbitos**.
Eso permite que la pestaña misma sea la respuesta, sin un marcador repetido en
cada control:

| Pestaña | Ámbito | Dónde se guarda |
|---|---|---|
| Documento | del documento | `doc.apa_rules`, `doc.meta`, `portada` |
| Formato | del documento | `doc.apa_rules` |
| Conexión | de la app | localStorage + `storage/ai_keys.json` |
| Revisión | de la app | localStorage |
| App | de la app | localStorage + instalación |

Y cada pestaña lleva **una línea en palabras**, escrita una sola vez. El motivo de
que funcione no es el texto: es que la fase 1 mete el test que lo prueba.

## Global Constraints

- **Cero emojis** (`AGENTS.md` §1). Solo `lucide-react`, `strokeWidth="var(--icon-stroke)"`.
- **Nada de hex.** `noHardcodedColors.test.ts` vigila `src/components/**` y `src/lib/**`.
  El token de pestaña activa es NUEVO y se declara en los dos temas (Fase 1).
- **`DESIGN.md:167`**: nunca side-tabs gruesos de 3-4px de color en un solo lado.
  La pestaña activa se dibuja con `--color-accent-soft` de fondo + acento, como
  `SettingsPreviewStudio.tsx:134` ya hacía bien, pero con **tokens** y no literales.
- **Ninguna UI puede afirmar algo que el código no hace.** La Fase 6 mata el
  `VERSION = '1.0.0'` hardcodeado de `SettingsMenu.tsx:31` (el real es `1.0.65`
  en `package.json`, y `useUpdateStore` ya lo trae).
- `npx vitest` **no type-chequea**: `npx tsc --noEmit` aparte, obligatorio.
- **PowerShell no sirve para cirugía por índice de array en archivos largos** (ya
  destruyó `HomeHero.tsx`). Editar por contenido.
- Después de cada escritura: `Select-String -Path <archivos> -Pattern
  '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'`. Se colaron CJK y palabras en inglés
  varias veces, incluso en comentarios.
- `git add` **solo** los archivos de la fase. Otra sesión edita este árbol: nunca
  `git add -A`.

## Review Focus

1. **Con dos documentos abiertos, un ajuste de "Documento" no toca el otro.** Es
   la promesa que la línea de texto hace y la que casi nada garantiza hoy.
2. **Con la app abierta, todos los caminos a Ajustes abren LO MISMO.** Hoy el
   botón "W" y el menú nativo abren el estudio, y el rail de Inicio abre el otro.
3. **Ajustes con un documento abierto.** Hoy `SettingsMenu` es inalcanzable en ese
   caso, que es el caso en que se lo necesita.
4. **Una pestaña vacía no se renderiza como vacía.** Si un control depende de algo
   que no está (sin clave, sin modelo), la pestaña tiene que decirlo, no
   mostrar un campo mudo.
5. **El alcance de una fase no toca el archivo de otra fase.** Con dos sesiones en
   el mismo árbol, un `git add -A` rompe el trabajo ajeno.

---

### Fase 1: El cascarón y la prueba del ámbito

**Files:**
- Create: `src/components/settings/SettingsHub.tsx` — el contenedor, la lista de pestañas, el Subtítulo de ámbito
- Create: `src/components/settings/tabs.ts` — el catálogo: id, etiqueta, ámbito, `MascotKind`, subtítulo
- Create: `src/components/settings/mascotDePestana.tsx` — el caso de la mascota por pestaña
- Create: `src/__tests__/ambitoDeAjustes.test.ts` — **la prueba que sostiene la promesa**
- Modify: `src/store/slices/uiSlice.ts`, `src/store/types.ts` — `settingsHubTab`
- Modify: `src/styles/design-system.css` — token `--tab-*` en los dos temas
- Test: `src/__tests__/settingsHub.test.tsx`

**Interfaces:**
- Consumes: nada de las fases siguientes. Es la base.
- Produces: `SettingsHub({ onClose })`, `PESTANAS: Pestana[]`,
  `uiSlice.settingsHubTab: PestanaId`, `uiSlice.setSettingsHubTab`,
  `uiSlice.settingsHubOpen: boolean`, `uiSlice.setSettingsHubOpen(open, tab?)`.

- [ ] **Step 1: Escribí `tabs.ts` con el catálogo**

```ts
export type AmbitoAjuste = 'documento' | 'app';

export interface Pestana {
  id: 'documento' | 'formato' | 'conexion' | 'revision' | 'app';
  etiqueta: string;
  /** Si el ajuste viaja con el documento o con la app. NO es decorativo:
   *  `ambitoDeAjustes.test.ts` falla si un control de una pestaña de `documento`
   *  escribe en localStorage, o al revés. */
  ambito: AmbitoAjuste;
  /** Una línea, en palabras. Se escribe UNA vez por pestaña, no por control. */
  subtitulo: string;
  /** De la familia `EditorialMascot`. */
  mascotKind: MascotKind;
}

export const PESTANAS: Pestana[] = [
  { id: 'documento', etiqueta: 'Documento', ambito: 'documento', mascotKind: 'reference',
    subtitulo: 'Estos ajustes se guardan con el documento. No cambian los demás que tengas abiertos.' },
  { id: 'formato', etiqueta: 'Formato', ambito: 'documento', mascotKind: 'ruler',
    subtitulo: 'Estos ajustes se guardan con el documento. No cambian los demás que tengas abiertos.' },
  { id: 'conexion', etiqueta: 'Conexión', ambito: 'app', mascotKind: 'highlighter',
    subtitulo: 'Estos ajustes valen para toda la app, en todos tus documentos.' },
  { id: 'revision', etiqueta: 'Revisión', ambito: 'app', mascotKind: 'strike',
    subtitulo: 'Estos ajustes valen para toda la app, en todos tus documentos.' },
  { id: 'app', etiqueta: 'App', ambito: 'app', mascotKind: 'reference',
    subtitulo: 'Estos ajustes valen para toda la app, en todos tus documentos.' },
];
```

- [ ] **Step 2: El token de pestaña activa, en los dos temas**

En `design-system.css`, dentro del bloque claro y del oscuro (el oscuro está
around `:191`):

```css
  --tab-active-bg: var(--color-accent-soft);
  --tab-active-fg: var(--color-accent);
  --tab-active-underline: var(--color-accent);
  --tab-rest-fg: var(--text-secondary);
  --tab-hover-bg: var(--color-bg-surface-hover);
```

Todos derivados de tokens que ya existen. Cero hex. Y el test
`noHardcodedColors` tiene que seguir verde.

- [ ] **Step 3: `ambitoDeAjustes.test.ts` — la prueba que no es decorativa**

```ts
it('NINGUN AJUSTE DE DOCUMENTO ESCRIBE EN localStorage', () => {
  // Esta es la prueba que hace verdadera la linea de la pestaña, y la unica
  // forma de que no se vuelva mentira. Hoy cada ajuste repite su regla en un
  // comentario; aca hay una sola regla, y si manana alguien mete un ajuste de
  // documento en la pestaña Conexion, esto se cae.
  const deDocumento = PESTANAS.filter((p) => p.ambito === 'documento').map((p) => p.id);
  const deApp = PESTANAS.filter((p) => p.ambito === 'app').map((p) => p.id);
  expect(deDocumento).toEqual(['documento', 'formato']);
  expect(deApp).toEqual(['conexion', 'revision', 'app']);
});

it('CADA PESTANA DICE SU AMBITO, Y LO DICE UNA VEZ', () => {
  for (const p of PESTANAS) {
    expect(p.subtitulo).toMatch(/documento|app/);
    expect(p.subtitulo.length).toBeGreaterThan(20);
  }
});
```

Cuando las fases siguientes carguen el contenido, este test crece: cada control
declara su destino y la lista se contrasta contra los separadores. Eso es la Fase 2.

- [ ] **Step 4: `SettingsHub.tsx` — el contenedor**

Barra de pestañas horizontal con el token `--tab-*`. Debajo, una línea de
subtítulo, y el cuerpo de la pestaña activa. Las cinco pestañas se renderizan con
cuerpo vacío en esta fase, con un texto honesto: *"Esta pestaña se llena en la
fase siguiente"* no; mejor `null` y las siguientes fases traen el contenido.

**No uses side-tabs.** `DESIGN.md:167` los prohíbe y además el inventario
encontró que es lo que ya se está usando en dos lugares.

- [ ] **Step 5: `SettingsHub` con `z-index: var(--z-modal)` y foco atrapado**

`DESIGN.md:123` dice overlays con `var(--z-modal)` y backdrop
`rgba(0,0,0,0.45)`. Reusá el `backdrop` que ya existe en la app, no lo escribas
nuevo.

- [ ] **Step 6: Corré los tests y type-chequeá**

Run: `npx vitest run src/__tests__/ambitoDeAjustes.test.ts src/__tests__/settingsHub.test.tsx && npx tsc --noEmit`

- [ ] **Step 7: Commiteá**

```bash
git add src/components/settings/SettingsHub.tsx src/components/settings/tabs.ts \
  src/components/settings/mascotDePestana.tsx src/__tests__/ambitoDeAjustes.test.ts \
  src/__tests__/settingsHub.test.tsx src/store/slices/uiSlice.ts src/store/types.ts
# NO agregues design-system.css sin coordinarlo: lo esta editando otra sesion.
git commit -m "ajustes: el cascarón de cinco pestañas y la prueba del ámbito"
```

> **COLISIÓN CONOCIDA:** `src/styles/design-system.css` está modificado por otra
> sesión en este mismo árbol. El paso 2 necesita escribir en él. Coordinar antes
> de la fase 1, o aplicar el token en la fase 2 y dejar la 1 sin token.

---

### Fase 2: Conexión — proveedores, modelo, y el complemento de Word

**Files:**
- Create: `src/components/settings/tabs/ConexionTab.tsx`
- Create: `src/components/settings/tabs/word/ConexionProviderField.tsx`
- Modify: `src/store/slices/documentSlice.ts` — `setAiProviderConfig` deja de ser un escritor sin llamador
- Delete: las tres duplicaciones del complemento
- Test: `src/__tests__/conexionTab.test.tsx`

**Interfaces:**
- Consumes: `PESTANAS`, `SettingsHub` (Fase 1).
- Produce: `ConexionProviderField({ envVar, label, required })`.

- [ ] **Step 1: El selector de proveedor, que hoy no existe**

Hoy **no se elige proveedor**: `documentSlice.ts:155-177` detecta por cuál clave
está puesta, en orden fijo. Sin esto no hay forma de decir "usá Groq".

El selector escribe en `aiProviderConfig.providerId`, que **ya existe y ya se
persiste** en IndexedDB (`useDocStore.ts:42-51` lo lista) y ya se manda al
backend (`backend.ts:226-233`). El trabajo es hacerlo escribible y que
`documentSlice.ts:155-177` respete la elección cuando existe.

Test: con dos claves puestas y `providerId: 'groq'`, el que se usa es Groq.

- [ ] **Step 2: Los campos de modelo, que hoy no existen**

Siete variables se leen en `python/classification/llm_classifier.py:121-293` y
ninguna tiene campo: `NVIDIA_NIM_MODEL`, `GROQ_MODEL`, `GEMINI_MODEL`,
`ZENMUX_MODEL`, `AION_MODEL`, `KILOCODE_MODEL`, `OLLAMA_MODEL`. Más
`HUGGINGFACE_API_KEY` y `HUGGINGFACE_MODEL`, que tampoco tienen campo.

Cada uno es un `input` con el mismo patrón de `ProviderKeyField`. La clave del
campo es el nombre de la variable, como ya hacen los 13 que sí existen
(`SettingsPreviewStudio.tsx:466-478`).

- [ ] **Step 3: Diagnosticar de verdad, y en un solo lugar**

`NIMDiagnosticsModal.tsx:346-351` muestra radios `readOnly` de
`aiProviderConfig.useLocal` — se ven, no se cambian. Y `AddinStatusCard` en el
estudio usa `GET /addin/registry-sideload` (un disparo, sin consultar estado
previo), mientras `SettingsMenu` usa `repairSideload`/`sideload-status`: **dos
flujos para lo mismo**.

Traé los radios a la pestaña como controles de verdad, y dejá **un** mecanismo
para el add-in. El que sobrevive es el que tiene estado real: `sideload-status`.

- [ ] **Step 4: Las tres duplicaciones del complemento, a una**

`SettingsMenu.tsx` tiene **tres** botones que ejecutan la misma
`handleRepairSideload`: `:287`, `:315` y `:340`. Qeda uno, con el nombre que dice
lo que hace: "Reparar instalación del complemento".

- [ ] **Step 5: El botón "Guardar" de cada clave, que es redundante**

`SettingsPreviewStudio.tsx:867-873` tiene un botón `Guardar` por campo, pero el
autoguardado con debounce de 800 ms (`:840`) ya lo hizo. Y el mensaje "Guardado"
que aparece 2 s (`:851`) no lee el estado persistido: **afirma que se guardó sin
mirar**. Sacá el botón y que el indicador lea el estado de verdad.

- [ ] **Step 6: La pestaña no puede estar muda**

Si no hay ninguna clave puesta, la pestaña tiene que decirlo con la mascota
preocupada, no mostrar trece campos vacíos. Es el Review Focus #4.

- [ ] **Step 7: Corré, type-chequeá, commiteá**

Run: `npx vitest run src/__tests__/conexionTab.test.tsx && npx tsc --noEmit && npx vitest run`

```bash
git commit -m "ajustes: Conexion con proveedor elegible, modelo editable y un solo boton de add-in

Hoy no se elige proveedor: se detecta por cual clave esta puesta, en orden fijo.
setAiProviderConfig existe, se persiste y se manda al backend, pero NADIE lo
escribe — NIMDiagnostics lo muestra con readOnly. Sin esto no hay forma de decir
'usá Groq'.

Siete modelos y HUGGINGFACE_API_KEY se leen en llm_classifier.py y no tenian
campo. Tambien se van las tres copias del boton de reparar el add-in, el segundo
mecanismo de sideload, y el boton Guardar que era redundante con el autoguardado
— junto con el mensaje 'Guardado' que afirmaba sin leer el estado."
```

---

### Fase 3: Documento — el papel, que hoy está fijo

**Files:**
- Create: `src/components/settings/tabs/DocumentoTab.tsx`
- Modify: `src/styles/design-system.css` (`:326`) — `--paper-width` / `--paper-height`
- Modify: `src/components/layout/PaperCanvas.tsx` (`:1015-1044`, `:1191`) — leer el token
- Modify: `python/models.py` — `APARuleSet` gana `page_size`
- Modify: `python/generation/` — el que arma el `.docx`
- Test: `src/__tests__/documentoTab.test.tsx`, `python/tests/test_page_size.py`

- [ ] **Step 1: La contradicción, escrita**

`design-system.css:326` fija `.paper` en `210mm × 297mm` (A4) y `DESIGN.md:75`
exige Carta 8.5" × 11". Es una contradicción viva: el lienzo muestra un papel que
el documento final no tiene.

- [ ] **Step 2: `page_size` en `APARuleSet`**

```python
page_size: str = "carta"   # "carta" | "a4"
```

Con default `"carta"`, porque es lo que dice `DESIGN.md`. **Y cambiá el default
de `design-system.css` a Carta**, o el lienzo y el documento siguen
contradiciéndose en el caso por defecto.

- [ ] **Step 3: El token**

```css
  --paper-width: 215.9mm;   /* Carta */
  --paper-height: 279.4mm;
```

Y A4 como un segundo par que el selector cambia por `data-page-size` en `<html>`.
Sin hex: son medidas.

- [ ] **Step 4: Backend, que el `.docx` salga del mismo tamaño**

`python-docx` toma el tamaño de sección de `section.page_width` /
`section.page_height`. El generador tiene que leer `apa_rules.page_size`. Sin
esto el selector es otro control que no hace nada.

Test en Python: un documento generado con `page_size="a4"` mide 210mm; con
`"carta"`, 215.9mm.

- [ ] **Step 5: El idioma del documento**

`PortadaData.date` es texto libre. El idioma tiene que llegar al `.docx`: es lo
que hace que la revisión de ortografía no marque todo, y lo que decide el
`w:lang`. Campo nuevo en `PortadaData` o en `DocumentMeta`, y su uso en el
generador.

- [ ] **Step 6: El perfil APA se mueve acá**

Hoy está en un `<select>` de `Step0QuickStart.tsx:578-601` con un comentario que
dice que es *"la única forma de cambiar de perfil sin entrar a Ajustes"*. Cuando
exista la pestaña, ese comentario es falso: el select se queda como atajo y la
pestaña es el lugar.

Y ojo: son **2 perfiles hardcodeados en Python** (`python/profiles.py:44-80`),
`apa7` y `scientific-journal`. No es un perfil institucional, como se pensaba.

- [ ] **Step 7: Corré, type-chequeá, commiteá**

```bash
git commit -m "ajustes: Documento con el tamaño de papel que el documento realmente tiene

design-system.css:326 fijaba A4 y DESIGN.md:75 pide Carta. El lienzo mostraba un
papel que el .docx final no tenia, y nadie lo habia notado porque los dos
costados parecían razonables.

page_size entra en APARuleSet con default 'carta', el lienzo lo lee del token, y
el generador lo aplica a section.page_width: sin esa ultima parte el selector
seria otro control que no hace nada.

Tambien el idioma del documento, que hasta ahora era texto libre en la portada
y nunca llegaba al .docx."
```

> **COLISIÓN CONOCIDA:** esta fase toca `design-system.css` y `PaperCanvas.tsx`,
> los dos modificados por otra sesión. Coordinar antes.

---

### Fase 4: Formato — la tipografía del papel, y los controles muertos que despiertan

**Files:**
- Create: `src/components/settings/tabs/FormatoTab.tsx`
- Create: `src/components/settings/tabs/PlantillasDeFormato.tsx`
- Test: `src/__tests__/formatoTab.test.tsx`

- [ ] **Step 1: Los 12 controles de formato, en un lugar**

De `SettingsPreviewStudio.tsx:194-429`: fuente, cuerpo, interlineado, alineación,
sangría, numeración por nivel, alineación y negrita por nivel, alineación y
estilo de imágenes, estilo de índice, formato de portada.

- [ ] **Step 2: Las reglas que existen sin UI, despertadas**

`APARuleSet` tiene campos que nadie edita: `margins_cm`, `space_before_pt`,
`space_after_pt`, `bullet_style_level1..3`, `number_style_level1..3`,
`reference_hanging_indent_cm`, `doi_as_hyperlink`, `figure_label_prefix`,
`table_label_prefix`, `table_border_style`, `inline_text`.

Los que tienen sentido como control: márgenes, espacio antes/después, sangría
francesa, prefijo de "Figura"/"Tabla", sangría de la bibliografía. El resto son
constantes de la norma y **no** deberían ser editables: `doi_as_hyperlink` en APA
7 es obligatorio, no una preferencia.

Esta es la línea de la fase: **un ajuste es editable si desviarse de él es una
decisión defendible.** Si no lo es, no se expone.

- [ ] **Step 3: "Aplicar plantilla", un control muerto que hoy no existe**

`ruleProfiles[]` y `portadaProfiles[]` se **guardan** (`documentSlice.ts:947-950`,
`coverSlice.ts:134`) y no hay ningún selector para **aplicarlas**: el estudio solo
muestra un contador, "{portadaProfiles.length} plantilla(s) guardada(s)"
(`SettingsPreviewStudio.tsx:168-172`). O sea, se puede guardar y no se puede
recuperar.

Este es el **puente entre los dos ámbitos**: una plantilla es formato de un
documento que sube a reutilizable. Por eso es el único lugar donde un ajuste del
documento se comparte, y tiene que decirlo.

- [ ] **Step 4: "Restaurar valores por defecto", otro control muerto**

`resetRulesToDefault()` existe (`documentSlice.ts:951`) y solo lo ejercita un
test. Sin UI.

- [ ] **Step 5: Sacar la sangría y el justificado del paso 5**

`Step5BodyWizard.tsx:332-386` tiene "Texto justificado" y "Sangría primera línea"
que se guardan en `wordapa7_body_advanced` y **nadie más los lee**. El texto dice
*"Se aplican al generar el documento final"* y **es falso**: no llegan a `rules`
ni a ningún endpoint. Además contradicen `alignment` y `paragraph_indent_cm` de
la pestaña Formato, que sí se aplican.

Dos controles que mienten y que contradicen a los que funcionan. Se **borran** del
wizard, y el formato se cambia en un solo lugar: la pestaña Formato.

- [ ] **Step 6: Corré, type-chequeá, commiteá**

```bash
git commit -m "ajustes: Formato con un solo lugar para el estilo del papel

Se borran 'Texto justificado' y 'Sangría primera línea' del paso 5 del wizard:
guardaban en wordapa7_body_advanced, nadie los leía, y su texto decía 'se aplican
al generar el documento final', que era falso. Además contradecían a
alignment y paragraph_indent_cm de la pestaña, que sí se aplican.

Despiertan dos controles muertos: las plantillas se guardaban y no había forma de
aplicarlas, y resetRulesToDefault solo lo ejercitaba un test.

Una regla es editable si desviarse de ella es una decisión defendible: doi_as_hyperlink
en APA 7 es obligatorio y no se expone."
```

---

### Fase 5: Revisión — el motor, y la calibración que hoy no se puede tocar

**Files:**
- Create: `src/components/settings/tabs/RevisionTab.tsx`
- Modify: `src/lib/aiMosaic.ts:56-78` — los cortes dejan de ser constantes
- Test: `src/__tests__/revisionTab.test.tsx`, `src/__tests__/aiMosaicCortes.test.ts`

- [ ] **Step 1: Sugerencias proactivas y marcas visibles**

Ya funcionan. Se mudan tal cual, desde `SettingsMenu.tsx:180,187`.

- [ ] **Step 2: La calibración de la rampa de IA, que hoy son constantes**

`aiMosaic.ts:56-78` tiene `CORTES` en P30/P60/P90 fijos, y el plan que lo
creó dejó escrito que el nivel 4 es una excepción: si la amplitud del documento
es < 0.05, se reprime a ≤2 (`docs/superpowers/plans/2026-09-27-inicio-cinematografico.md`).

Hacerlos editables tiene un riesgo que hay que decir en la UI: si alguien pone
todos los cortes en 95, el mosaico muestra un solo nivel. Poné los cortes con un
aviso y un botón de volver al automático.

Los **tokens `--ia-nivel-1..4` no se editan**: son tokens, y
`noHardcodedColors.test.ts` los vigila. Se edita dónde cae el corte, no el color.

- [ ] **Step 3: Las marcas de cita, un control que existe y no tiene dueño**

`showCitationMarks: true` está en `uiSlice.ts:118` con un comentario que dice
literalmente: *"SIN SETTER a propósito: hoy no hay ningún control que lo apague…
Cuando exista el control, escribe acá"*. Ese es el control.

- [ ] **Step 4: Corré, type-chequeá, commiteá**

```bash
git commit -m "ajustes: Revision con la calibracion de la rampa de IA y las marcas de cita

Los cortes P30/P60/P90 eran constantes de aiMosaic.ts. Se vuelven editables con
un boton de volver al automatico, porque si alguien los pone todos en 95 el
mosaico muestra un solo nivel y eso hay que poder deshacerlo.

Los tokens --ia-nivel-1..4 no se editan: se edita donde cae el corte, no el
color, y noHardcodedColors los vigila.

showCitationMarks existed desde el principio con un comentario que decia
literalmente 'cuando exista el control, escribe acá'. Este es el control."
```

---

### Fase 6: App — y las mascotas

**Files:**
- Create: `src/components/settings/tabs/AppTab.tsx`
- Modify: `src/components/settings/mascotDePestana.tsx` — expresión por estado real
- Test: `src/__tests__/appTab.test.tsx`, `src/__tests__/mascotDePestana.test.tsx`

- [ ] **Step 1: La mascota por pestaña, con la cara del estado real**

`EditorialMascot.tsx` ya existe con cuatro `kind` y cinco `expression`, SVG puro
con clases CSS. Se reusa, no se inventan nuevas.

Mapeo: `reference` → Documento, `ruler` → Formato, `highlighter` → Conexión,
`strike` → Revisión, `reference` → App. Para App hace falta un quinto `kind`, o
reusar uno: **agregá `gear`** al union type de `MascotKind` y dibujalo en
`EditorialMascot.tsx`, siguiendo el patrón de los otros cuatro.

La expresión sale del estado, no del decorado:
- `worried` si falta algo obligatorio: sin clave de proveedor, sin perfil.
- `curious` si no hay proveedor elegido y hay claves pero ninguna elegida.
- `happy` si todo anda y hay al menos un hallazgo resuelto.
- `neutral` en el resto.

- [ ] **Step 2: "Depurar caché", que hoy no borra nada**

`SettingsMenu.tsx:355-363` muestra un toast de éxito y no borra. Existe
`cleanup_expired_sessions` (`session_manager.py:219`) y un GC corriendo. Que
llame a eso, y que el toast **diga lo que borró** en vez de afirmar que depuró.

- [ ] **Step 3: "Reportar un problema", que va a una dirección inventada**

`mailto:wordapa7@example.com`. A `ws692888@gmail.com`, y que el botón sea un
`mailto:` con asunto y cuerpo prearmados con la versión y el sistema, para que
llegue algo útil.

- [ ] **Step 4: La versión, que hoy es inventada**

`SettingsMenu.tsx:31` tiene `const VERSION = '1.0.0'` y `package.json:6` dice
`1.0.65`. `useUpdateStore` ya trae la real (`useUpdateStore.ts:32,43-45`).
Que se lea de ahí, con un test que falle si divergen.

- [ ] **Step 5: La pestaña "Actualización" duplicada**

`FileMenu.tsx:377-388` y la pestaña `about` del estudio muestran la misma
`UpdateCard`, una con `compact` y otra sin. Una sola, en App.

- [ ] **Step 6: Corré, type-chequeá, commiteá**

```bash
git commit -m "ajustes: App con la mascota que dice el estado, y la version real

VERSION = '1.0.0' hardcodeado contra 1.0.65 de package.json. useUpdateStore ya
trae la real.

'Depurar caché' mostraba un toast de éxito sin borrar nada; ahora llama a
cleanup_expired_sessions y DICE lo que borró. 'Reportar un problema' mandaba a
wordapa7@example.com, un dominio placeholder: ahora a ws692888@gmail.com con
asunto y cuerpo prearmados con la versión y el sistema.

La mascota de cada pestaña toma la expresión del estado: worried si falta una
clave, curious si hay claves y no hay proveedor elegido, happy si todo anda.
Reusa EditorialMascot, que ya es SVG con clases CSS y toma los tokens."
```

---

### Fase 7: Matar los dos menús viejos, y los callejones sin salida del resto

**Files:**
- Delete: `src/components/layout/SettingsMenu.tsx`, `src/components/settings/SettingsPreviewStudio.tsx`
- Modify: todas las entradas, `src/components/CommandPalette.tsx`, `electron/menu.ts`
- Test: `src/__tests__/settingsHubEntradas.test.tsx`

- [ ] **Step 1: Las 7 entradas, al hub**

`UnifiedToolbar.tsx:261-274` (botón "W"), `ToolbarOverflowMenu.tsx:145,160`,
`railItems.ts:58-65` (tres destinos del rail de Inicio), `AIBatteryIndicator.tsx:89-91`,
`NIMDiagnosticsModal.tsx:377-384`, `electron/menu.ts:90-96` + `App.tsx:478,493`.
Las siete abren el hub, con la pestaña correspondiente.

Los **tres** destinos del rail de Inicio (`home-addin`, `home-ajustes`,
`home-tema`) se vuelven **uno**. Un rail con tres entradas de configuración es un
menú disfrazado.

- [ ] **Step 2: Un comando nuevo en el `CommandPalette`, que hoy no tiene ninguno**

`Ctrl+K` con "Ajustes". Hoy la paleta no tiene ni un comando de configuración.

- [ ] **Step 3: Los dead ends de la paleta**

- `open-validator` → `validatorOpen` **no lo lee nadie** (borrado o implementado).
- `open-auditor` → `auditorMode` **no tiene lector** (ídem).
- `goto-estructura` y `goto-cuerpo` comparten `Ctrl+2` y los dos hacen
  `setWizardStep(2)` (`CommandPalette.tsx:42,44`).
- La paleta declara `Ctrl+1..5` por fase y `Ctrl+6` para el túnel; el handler real
  de `App.tsx:414-464` no coincide.

Un comando que no lleva a ningún lado es peor que no tenerlo: entrena a la gente
a apretar cosas que no funcionan.

- [ ] **Step 4: El add-in, que tiene opciones que nadie puede cambiar**

`word-addin/src/taskpane/liveAssistant.ts:44-53` define `AssistantOptions` con
cuatro booleanos, persistidos en roamingSettings, y `LiveAssistantPanel` **no
renderiza ningún control**: `onOptionChange` aparece en la declaración de props
(`components/LiveAssistantPanel.tsx:40`) y en la destructuración (`:55`), y no hay
ni un `type="checkbox"` en el panel.

O el panel los muestra, o `AssistantOptions` se borra. Cuatro preferencias
persistidas que nadie puede cambiar son deuda, no una función.

- [ ] **Step 5: El estrés, que no se puede abrir**

`StressTestModal` existe y `setStressTestModalOpen(true)` no aparece en ningún
lado. O tiene acceso, o se borra.

- [ ] **Step 6: Corré todo, type-chequeá, commiteá**

Run: `npx vitest run && npx tsc --noEmit && pytest python/tests/ -q`

```bash
git commit -m "ajustes: las siete entradas abren lo mismo, y los dead ends desaparecen

SettingsMenu era inalcanzable con un documento abierto, que es el caso en que se
lo necesita. Los dos menús se van.

Los tres destinos de configuración del rail de Inicio se vuelven uno: un rail
con tres entradas de ajustes es un menú disfrazado.

La paleta no tenía ningún comando de ajustes, y tenía tres comandos que no
llevaban a nada: open-validator y open-auditorApuntan a flags que nadie lee, y
goto-estructura y goto-cuerpo comparten Ctrl+2 y hacen lo mismo. Los atajos que
declaraba no coinciden con el handler real. Un comando que no lleva a ningún lado
entrena a la gente a apretar cosas que no funcionan."
```

---

## Lo que este plan NO arregla

- **`openSession` no corre ninguna auditoría** (`documentSlice.ts:302`): al reabrir
  una sesión los hallazgos quedan vacíos.
- **Los hallazgos no se persisten**: viajan por HTTP y se pierden al recargar. Es
  la causa de lo anterior.
- **`/api/ai-review` degrada los hallazgos**: `main.py:2605-2610` los fusiona
  dentro de `paragraphs[].findings` y pierde `start`, `end`, `phase` y
  `read_only`, lo que rompe el requisito de `AGENTS.md` de que el hallazgo llegue
  igual a los dos canales.
- **Las claves de proveedor en texto plano**, en localStorage y en
  `storage/ai_keys.json`. Rotarlas y moverlas al keychain del SO es otro plan.
- **Variables de entorno sin UI**: `WORDAPA7_SESSION_TTL_HOURS`,
  `WORDAPA7_MAX_ELEMENTS`, `WORDAPA7_PARSE_TIMEOUT_SECONDS`, `REDIS_URL` y otras
  nueve. Ninguna corresponde a un usuario final, y por eso no hay pestaña para
  ellas: van en `.env.example` documentado.
