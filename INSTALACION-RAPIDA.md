# 📦 Instalación de WordAPA7 — Guía rápida

> **No necesitás instalar nada extra.** Solo necesitás tener **Microsoft Word**
> instalado en tu computadora.

---

## Paso 1 — Descargar el instalador

Descargá el archivo `WordAPA7 Setup X.X.X.exe` desde:

👉 https://github.com/WalterSolorzano/ProyectoAPA7/releases

Guardalo en tu carpeta de **Descargas** (o donde prefieras).

---

## Paso 2 — Ejecutar el instalador

Hacé **doble clic** en el archivo descargado.

### ⚠️ Aviso de SmartScreen (¡es normal!)

Windows va a mostrar una pantalla azul que dice:

> **"Windows protegió tu equipo"**
>
> Microsoft Defender SmartScreen evitó que se iniciara una aplicación no
> reconocida. Si la inicias, podrías poner en riesgo tu equipo.

**Esto NO es un virus.** Aparece porque el instalador es gratuito y no tiene
un certificado de firma de código comercial (esos certificados cuestan
cientos de dólares por año). El código es abierto y podés revisarlo en el
repositorio de GitHub.

Para continuar, hacé **2 clics**:

1. Clic en **"Más información"** ← aparece como texto abajo a la izquierda
2. Clic en **"Ejecutar de todas formas"** ← aparece como botón

```
 ┌──────────────────────────────────────────────┐
 │  Windows protegió tu equipo                   │
 │                                                │
 │  Microsoft Defender SmartScreen evitó que se  │
 │  iniciara una aplicación no reconocida...      │
 │                                                │
 │                       [ No ejecutar ]          │
 │                                                │
 │  Más información                               │ ← clic aquí
 └──────────────────────────────────────────────┘

         ┌──────────────────────────────────────┐
         │  Windows protegió tu equipo           │
         │                                        │
         │  Aplicación: WordAPA7 Setup X.X.X.exe │
         │  Editor desconocido                    │
         │                                        │
         │  [ Ejecutar de todas formas ]  [ No ]  │ ← clic aquí
         └──────────────────────────────────────┘
```

---

## Paso 3 — Esperar a que instale

El instalador hace todo **automáticamente**:

- ✅ Copia la aplicación y el complemento de Word
- ✅ **Registra el complemento en Word** (no tenés que hacer nada en Word)
- ✅ Agrega "Convertir a APA 7" al clic derecho sobre archivos `.docx`
- ✅ Configura el inicio automático en segundo plano

**No te pide permisos de administrador.** Todo se instala en tu usuario.

---

## Paso 4 — Abrir Word

Al terminar la instalación, la aplicación se abre sola (la primera vez tarda
**10 a 20 segundos** en arrancar; es normal, esperá).

**Abrí Microsoft Word.** Vas a ver una nueva pestaña llamada **"WordAPA7"**
arriba en la barra, junto a las demás pestañas.

> 💡 **Si no aparece la pestaña**: cerrá Word **completamente** (todas las
> ventanas) y volvé a abrirlo. El complemento se carga al abrir Word.

---

## Resumen del flujo

| Paso | Acción | ¿Clics? |
|---|---|---|
| 1 | Descargar el `.exe` | 0 |
| 2 | Doble-clic en el `.exe` | 1 |
| 3 | SmartScreen → "Más información" | 1 |
| 4 | SmartScreen → "Ejecutar de todas formas" | 1 |
| 5 | El instalador hace todo solo | 0 |
| 6 | Abrir Word | 1 |
| **Total** | | **~4 clics + abrir Word** |

---

## Desinstalación

Desde **Configuración → Aplicaciones → Aplicaciones instaladas** (o
*Agregar o quitar programas*), buscá "WordAPA7" y desinstalá.

Se eliminan la aplicación, el complemento de Word y el certificado SSL
automáticamente. **Tus documentos originales no se modifican** y tus claves
de IA (si las configuraste) se conservan por si reinstalás.

---

## Preguntas frecuentes

**¿Por qué aparece el aviso azul de SmartScreen?**
El instalador no tiene un certificado de firma de código comercial (cuestan
$200-$500/año). Windows muestra este aviso para cualquier `.exe` descargado
de internet sin firma de una CA reconocida. No es un virus — el código es
abierto y podés auditarlo.

**¿Necesito permisos de administrador?**
No. El instalador es por-usuario (`perMachine: false`): se instala en
`%LOCALAPPDATA%\Programs\WordAPA7\` sin pedir elevación.

**¿El complemento aparece solo en Word o tengo que agregarlo?**
Aparece **solo**. El instalador registra el manifiesto del add-in en
`HKCU\Software\Microsoft\Office\16.0\Wef\Developer`, que es el mecanismo
oficial de Office para auto-carga de desarrolladores. No necesitás ir a
*Insertar > Mis complementos > Agregar*.

**¿Funciona en computadoras de la universidad sin permisos admin?**
Sí. Toda la instalación es por-usuario (HKCU + `%LOCALAPPDATA%`). No toca
`HKLM` ni `C:\Program Files`.

**¿Qué pasa si el complemento no aparece?**
1. Cerrá Word completamente (todas las ventanas).
2. Volvé a abrirlo.
3. Si sigue sin aparecer, abrí la aplicación de escritorio de WordAPA7,
   esperá 20 segundos a que el backend arranque, y después abrí Word.
