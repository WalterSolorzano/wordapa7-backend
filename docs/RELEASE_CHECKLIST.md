# Checklist de release (WordAPA7)

Smoke manual OBLIGATORIO antes de publicar. Cada incidente grave del 2026-08
 vino de un punto de esta lista sin verificar.

## Instalador (NSH)

- [ ] `customInstall` no borra claves que el propio install acaba de crear
      (regresion historica: menu contextual .docx auto-eliminado).
- [ ] Clave Run = `pythonw.exe` (SIN consola). Verificar en
      `HKCU\...\CurrentVersion\Run`: ninguna entrada con `python.exe`.
- [ ] Upgrade desde build viejo: clave heredada `WordAPA7Watcher` eliminada.

## Boot / watcher

- [ ] Reiniciar Windows: NO aparece ventana CMD; solo `core_server` invisible.
- [ ] `%APPDATA%\WordAPA7\watcher.log` muestra "Nucleo ya activo (adoptado)"
      o "Backend pre-cargado", nunca "Nucleo muerto; reiniciando" en bucle.
- [ ] Con Word abierto y backend caido a proposito: se recupera una vez,
      con backoff 10/30/60s si falla (ver `backend-child.log`).

## Contrato add-in <-> motores

- [ ] `cd python && python -m pytest tests/test_addin_contract_parity.py -v`
      en verde (mata clase "Motor central no disponible" y 404 silenciosos).
- [ ] `npm run gen:api-types` sin diff inesperado en `src/types/api-generated.d.ts`.

## Add-in en Word

- [ ] Taskpane carga; consola muestra `Motor app|core v... — panel v...`.
- [ ] Convertir documento SIN la app abierta: aplica formato local
      (fallback), NUNCA lanza "Motor central no disponible".
- [ ] Plantillas: aplicar una -> sin "Method Not Allowed".
- [ ] Un solo panel de edicion por elemento (sin duplicados de ImageEditPanel).

## Backend / salud

- [ ] `python -m pytest` completo en verde.
- [ ] `npx vitest run` (raiz) y en `word-addin/` en verde.
- [ ] Sin `@app.on_event` ni warnings de deprecation en boot.
- [ ] CORS: add-in servido desde URL publica (si aplica) sigue pudiendo
      llamar al loopback (`WORDAPA7_ADDIN_PUBLIC_URL` en allowlist).

## Referencias

- [ ] Bibliografia con entradas repetidas en el .docx original: export deja 1.
- [ ] Ventana validador abre desde cualquier paso (drawer global).
