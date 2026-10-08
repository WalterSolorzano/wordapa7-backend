# Plan — Capa de rediseño de superficies (2026-10-04)

Spec: `docs/superpowers/specs/2026-10-04-capa-rediseno-superficies-design.md`.
Una fase = un commit atómico. Tras cada fase: tests focalizados + `npx tsc
--noEmit`; antes del commit final de cada fase, mutar su guardián.

Convención: `alias→token` significa reemplazar el alias legacy y su fallback
hex/rgba por el `--color-*` canónico.

---

## P1 — Superficies canónicas y profundidad (bajo riesgo, alto impacto)

Objetivo: todo modal pasa por `Modal`; todo `zIndex` entra en `--z-*`.

- [ ] P1.0 Mapa de z: decidir escalones. `--z-dropdown` 100 · `--z-sticky` 200 ·
      `--z-overlay` 900 · `--z-modal` 1000 · `--z-toast` 1200. Nada por encima.
- [ ] P1.1 `CommandPalette.tsx` z 10000→`--z-modal`; backdrop rgba→`--scrim-overlay`.
- [ ] P1.2 `TemplateDialog.tsx` z 10000→`--z-modal`; `#ffffff`→`--color-bg-surface`; backdrop→`Modal`.
- [ ] P1.3 `OnboardingTour.tsx` z 9990→`--z-modal`; backdrop→`--scrim-overlay`.
- [ ] P1.4 `LLMConsentDialog.tsx` z 9500→`--z-modal`; alias→token; backdrop→`Modal`.
- [ ] P1.5 `NIMDiagnosticsModal.tsx` z 9999→`--z-modal`; rgba/`#fff`→tokens; `Modal`.
- [ ] P1.6 `DesignAuditor.tsx` z 20000→`--z-modal` (o `--z-toast` si es de aviso); `32px`→`--space-8`.
- [ ] P1.7 `AIBatteryIndicator.tsx` z 9999→`--z-toast`; alias→token; `#fff`→`--color-text-on-accent`.
- [ ] P1.8 `MiniToolbar.tsx` z 5000→`--z-dropdown`; `MascotBubble.tsx` z 9000→`--z-overlay` + tokens.
- [ ] P1.9 `App.tsx` drawer/validator (133/193) → `--z-modal`/`--z-overlay`; `Modal` donde aplique.
- [ ] P1.10 `ExportView.tsx` z 10→`--z-base`; `DownloadSuccessOverlay` tokens.
- [ ] P1.11 Test guardián: grep de `zIndex` numérico fuera de `var(--z-` en `src/components/**`; falla si aparece uno.

Verificación: `noHardcodedColors`, `designTokens`, tests de cada modal; `tsc`.

## P2 — Tokens y tipografía del chrome

- [ ] P2.1 `UnifiedToolbar.tsx` (height 48→token de chrome, gap→`--space-*`).
- [ ] P2.2 `APAScoreCard.tsx` + `APAModuleToggles.tsx`: ~20 alias+hex→tokens; z 90/100→`--z-dropdown`.
- [ ] P2.3 `StatusBar.tsx`: `--sidebar-bg`→`--color-bg-surface`, `--text-muted`→`--color-text-tertiary`.
- [ ] P2.4 `RightSidePanel.tsx` + `ActionBar.tsx`: alias→token; rgba/`#fff`→tokens.
- [ ] P2.5 `DocumentAIChat.tsx`: `--sidebar-bg`/`--accent-primary`/`--text-main`→tokens; `rgba(0,0,0,.04)`→token.
- [ ] P2.6 `FileMenu.tsx` + `UpdateCard.tsx`: alias→token; `rgba(220,38,38,.35)`→`--color-danger` alpha.
- [ ] P2.7 `ProjectTabs.tsx` + `IconRail.tsx`/`RailFlyout.tsx`: alias/px→tokens.

## P3 — Wizard: Estructura y Figuras

- [ ] P3.1 `EscritorioEstructura.tsx`: `760/452/308/44px`→`--space-*`/constantes.
- [ ] P3.2 `MapaEstructura.tsx` `17-22`: px→constantes de layout compartidas.
- [ ] P3.3 `TallerFigurasView.tsx` + `GaleriaActivosColumna.tsx`: px→tokens.
- [ ] P3.4 `InlineAILens.tsx` + `CaptionSuggestionBadge.tsx`: alias+hex→tokens; z 60/20→`--z-dropdown`.

## P4 — Wizard: Referencias y Revisión

- [ ] P4.1 `Step5ReferencesWizard.tsx` z 40/50/1000→`--z-*`; `ReferenceCatalogItem` z 5→`--z-base`; `ReferenceEditModal` z 200→`--z-modal` + `Modal`.
- [ ] P4.2 `ReviewWorkbench.tsx` grid px→tokens; `ReviewMinimap.tsx` z/px→tokens; gate `prefers-reduced-motion` en transiciones.
- [ ] P4.3 `ReadingText.tsx`/`WhatsAppComment` intactos (regla de dos canales); solo tokens si aparece un literal.

## P5 — Settings (6 tabs) y Export

- [ ] P5.1 `SettingsHub.tsx` + 6 tabs: alias→token; `1100px`→constante; `Seccion` unificado.
- [ ] P5.2 `PlantillasDeFormato.tsx` px `220px`→token.
- [ ] P5.3 `ExportView.tsx`: columna única izquierda (si falta); `QuickReferenceSearch.tsx` alias/px→tokens.

## P6 — Proyectos, canvas y HomeHero

- [ ] P6.1 `ProyectosScreen.tsx` + `ExploradorProyecto` + `ProjectImagesDrawer` z 150→`--z-*`; `MergeDocumentsModal` z 1000 + `Modal`; `ProyectoNotificacion` tokens.
- [ ] P6.2 `PaperCanvas.tsx` z 100+→escala; geometría px se mantiene (es del papel).
- [ ] P6.3 `PDFPreview.tsx`/`ReactPDFPreview.tsx`: `color:'white'`→token; z 10→`--z-base`.
- [ ] P6.4 `HomeHero.tsx` hex/rgba→tokens con nombre (`--hero-*`), sin aplanar el arte.
- [ ] P6.5 `LoadingTips.tsx` hex fallbacks→tokens.

---

## Verificación final (antes de cerrar la capa)

- [ ] `npx vitest run` ≥ 1401 verdes; `npx tsc --noEmit` limpio.
- [ ] `pytest -q` ≥ 809 passed/14 skipped.
- [ ] `npm run build` OK.
- [ ] Guardián nuevo en verde y **mutado** (cae si se reintroduce un `zIndex` crudo o un alias).
- [ ] `git status` limpio; `git log` con una fase por commit.
