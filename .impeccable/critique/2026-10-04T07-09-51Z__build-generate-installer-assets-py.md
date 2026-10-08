---
target: installer (build/generate_installer_assets.py + build/installer.nsh)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:C:\\Users\\--X\\.gemini\\antigravity\\scratch\\wordapa7\\build\\generate_installer_assets.py"
target_fingerprint: "sha256:cadf8c1026a0467dde20cd33ca8b4a8143ecbe8cb4c5ee3b989dcbb496dec947"
target_path: "C:\\Users\\--X\\.gemini\\antigravity\\scratch\\wordapa7\\build\\generate_installer_assets.py"
timestamp: 2026-10-04T07-09-51Z
slug: build-generate-installer-assets-py
---
# Critique — WordAPA7 NSIS Installer

Method: dual-agent (A: general · B: general)

Target: build/generate_installer_assets.py + build/installer.nsh + electron-builder.yml (native NSIS installer surface)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Smooth progress bar + finish page; no page-level context during add-in registration |
| 2 | Match System / Real World | 3 | Spanish + academic terms, but "Edición Editorial"/"Limpieza Segura" are marketing-toned |
| 3 | User Control and Freedom | 2 | `allowToChangeInstallationDirectory:false` — no path choice; cancel only |
| 4 | Consistency and Standards | 2 | Installer vs uninstaller are different palettes; Baloo cartoon vs app Inter; 25+ non-token colors |
| 5 | Error Prevention | 3 | Detects open Word and offers graceful close; per-user install avoids UAC |
| 6 | Recognition Rather Than Recall | 3 | Standard wizard flow, clear labels |
| 7 | Flexibility and Efficiency | 3 | Near-one-click, low friction (appropriate for this installer) |
| 8 | Aesthetic and Minimalist Design | 2 | Gradient + decorative circles + text shadows + mustachioed mascot = noise against a "sobrio" brand |
| 9 | Error Recovery | 3 | Abort warning; graceful Word close; uninstaller best-effort cleanup |
| 10 | Help and Documentation | 2 | Welcome copy explains, no docs/support link |
| **Total** | | **26/40** | **Acceptable** (20–27) |

## Design Specificity Verdict

**LLM assessment**: Partially authored, mostly category-interchangeable. The wordmark, Baloo 2 face, and orange-document mascot tie to the app, so it is not a stock template — but the surrounding language (deep-blue vertical gradient, floating decorative circles, drop-shadowed text, mustachioed mascot) is the generic playful-startup idiom, not "académico, profesional, sobrio". Swap the wordmark and the sidebar still reads as "friendly blue app". Nothing says *APA 7 thesis tool* except a small pill.

**Deterministic scan**: The bundled detector has no scannable markup for a native NSIS installer — `impeccable detect --json build/installer.nsh` returned `[]` (exit 0); a scan of `build/` returned 2 advisories, both inside an unrelated PyInstaller HTML artifact (`build/pyinstaller-build/pyinstaller/xref-pyinstaller.html`). No installer finding. Browser overlay not applicable (no web surface).

**Evidence gathered (independent)**:
- Bitmap geometry correct vs MUI2 spec: header 150×57, sidebars 164×314 — no deviation.
- Text margins: sidebar title `WordAPA7` @30px leaves only **11.9px** per side (164px canvas); sidebar pill text `Normas APA 7ma Ed.` leaves **9.75px** inside its pill (x18–146). Both under a 12px comfort threshold — this is the "width" cramping.
- Color-token compliance: 25 hardcoded literals not in `design-system.css`/`design-tokens.md`, plus `MUI_BGCOLOR DEE7FF` and `MUI_TEXTCOLOR 14213D`.
- Welcome/finish copy: at 100% DPI the welcome text (~11 lines, ~154px) fits a ~200px area with ~46px headroom; finish fits comfortably. It is the tightest page and clips first at 125–150% DPI.

## Overall Impression

The installer has a clear, competent skeleton — branded wordmark, correct accents, no emojis, a graceful Word-is-open handler — wrapped in a visual world that contradicts the product's own stated brand. The single biggest opportunity: stop inventing a second design system and render the installer from the app's real tokens, then de-clutter the decoration.

## What's Working

1. **Wordmark treatment** (Baloo 2 800, white + shadow) is legible and consistent between header and sidebar.
2. **Accent fidelity in the functional layer**: the progress bar uses `#4f7cff` and the copy is emoji-free with correct accents/guillemets.
3. **Copy structure**: the "app + Word add-in" split on the welcome page communicates what gets installed.

## Priority Issues

**[P0] Palette invents a parallel design system**
- **What**: `installer.nsh:66-67` sets `MUI_BGCOLOR DEE7FF` / `MUI_TEXTCOLOR 14213D`; the generator invents `#dee7ff`, `#14213d`, `#2246c4`, `#2d52cd` and more. 25 literals are not tokens.
- **Why it matters**: the installer becomes the one surface that breaks token governance — a direct violation of AGENTS.md and the user's first contact with the brand.
- **Fix**: drive MUI colors from real tokens — page bg `#f5f6f8` (canvas) or `#ffffff` (surface), body text `#1a1a2e`/`#4a4a5e`, accent `#4f7cff`; delete the invented blues.
- **Suggested command**: `$impeccable colorize`

**[P0] Install and uninstall look like two different products**
- **What**: installer = blue gradient; uninstaller = slate/navy ramp with zero `#4f7cff` (`generate_installer_assets.py:182-185`).
- **Why it matters**: users can't form one product identity; the uninstaller reads as generic third-party cleanup.
- **Fix**: one accent, one surface family; differentiate with a neutral (not navy) tone and honest wording.
- **Suggested command**: `$impeccable colorize`

**[P1] Decorative idiom contradicts the "sobrio" brand**
- **What**: vertical gradient + floating circles + drop-shadowed text + a grinning, mustachioed cartoon document (`generate_installer_assets.py:146-148,162,86`).
- **Why it matters**: these are the exact "AI slop" patterns AGENTS.md bans; they undercut credibility for academic users.
- **Fix**: flat brand surface, remove circles and text shadows, use the app's restrained iconography; reserve the mascot for onboarding, not system chrome.
- **Suggested command**: `$impeccable quieter`

**[P1] Width cramping on the sidebar**
- **What**: title margins 11.9px/side; pill text 9.75px in-pill. The header wordmark (top-left of a 150×57 bitmap) competes with the MUI page-title text drawn beside it.
- **Why it matters**: reads as "text touching the edges" and degrades first on any DPI scaling.
- **Fix**: reduce title to ~26px or widen the layout; give the pill 14–16px in-pill padding; drop or re-purpose the header bitmap.
- **Suggested command**: `$impeccable layout`

**[P2] Tight welcome copy + stale comments**
- **What**: welcome text is the tightest page (~154px of ~200px) and clips first at 125–150% DPI; `installer.nsh:6-16` still claims `oneClick:true` while `electron-builder.yml:35` sets `oneClick:false`.
- **Why it matters**: clipped text looks broken; the wrong comment will mislead the next maintainer.
- **Fix**: trim welcome to 2 lines + one bullet and move the "Word se cerrará" warning into the existing runtime `MessageBox` (`installer.nsh:126`); correct the comments.
- **Suggested command**: `$impeccable clarify`

## Persona Red Flags

**Accessibility-dependent user**: tagline "Edición Editorial" is `#dee7ff` on `#4f7cff` — contrast ≈ **3.0:1**, below AA 4.5:1 for 14px semibold; the pill label is only **12px**; the rounded Baloo 2 face is a poor legibility choice (the app's own `--font-sans` is Inter).

**Confused first-timer**: sees a smiling mustachioed document, then a slate "Limpieza Segura" uninstaller that looks unrelated; the welcome page's dense "Nota" paragraph buries the one thing that matters (Word will close).

**Deliberate stress tester**: will note that `#dee7ff`, `#14213d`, `#2246c4` exist nowhere in the tokens, and that install and uninstall use different palettes.

## Minor Observations

- Header bitmap is a near-empty wordmark that duplicates the sidebar and adds no page context.
- Uninstaller tagline "Desinstalador" + "Limpieza Segura" are marketing-toned for a destructive action.
- Progress-bar pair `14213d 4f7cff` reuses a non-token navy.
- Decorative circles cropped at the sidebar edges read as noise, not structure.

## Questions to Consider

1. If you replaced the wordmark, would anything in these three bitmaps identify WordAPA7 — or just "friendly blue app"?
2. Why does the uninstall experience belong to a different color family than the install experience of the same product?
3. What does a mustachioed cartoon document communicate to a student whose thesis formatting is being judged?
