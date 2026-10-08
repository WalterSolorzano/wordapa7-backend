/**
 * Los logos de la portada, del lado del cliente.
 *
 * El dato vive en `portada.logos` y el asset se pide por nombre, no por una URL
 * escrita en el `.tsx`. Con la insignia hardcodeada en el componente, elegir UNAN
 * pedía `logo_anan.png` con doble `a` mientras que `python/main.py` sirve
 * `logo_unan.png`: un 404 en el que ninguno de los dos lados se enteraba.
 *
 * Y el ancho es una FRACCIÓN del ancho útil, igual que en `portada_uni.py`. Con
 * un ancho absoluto, el mismo logo se ve distinto en Carta y en A4.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn((u: string) => u),
  triggerDownload: vi.fn(),
}));

import { useDocStore } from '../store/useDocStore';
import { defaultActa, defaultPortada } from '../store/slices/coverSlice';
import { CATALOGO_DE_UNIVERSIDADES } from '../lib/portada/catalogo';
import { fraccionDeAnchoUtil, anchoUtilMm, FRACCION_DE_ANCHO_DEL_LOGO } from '../lib/portada/geometria';
import type { PortadaData } from '../types';

const estado = () => useDocStore.getState();
const portadaDe = (p: Partial<PortadaData>) =>
  useDocStore.setState({ portada: { ...defaultPortada, ...p }, acta: { ...defaultActa } } as never);

describe('los logos de la portada', () => {
  beforeEach(() => {
    portadaDe({});
  });

  it('el catalogo de universidades apunta a assets que el backend sirve', () => {
    // El 404 de UNAN: `logo_anan.png` con doble `a` no lo sirve nadie. Con
    // doble `a` el preset no encuentra su insignia y no hay forma de saber que
    // el asset falta.
    const src = CATALOGO_DE_UNIVERSIDADES.find((u) => u.codigo === 'UNAN')!.logoUrl!;
    expect(src).toBe('/api/assets/logo_unan.png');
    expect(src).not.toContain('anan.png');
  });

  it('elegir una institucion del catalogo deja su logo en portada.logos', () => {
    estado().updateCoverInstitucion('UNAN');
    const logos = estado().portada.logos!;
    expect(logos).toHaveLength(1);
    expect(logos[0].asset).toBe('logo_unan.png');
    expect(logos[0].institucion).toBe('UNAN');
  });

  it('cambiar de institucion cambia el logo, no lo acumula', () => {
    estado().updateCoverInstitucion('UNI');
    estado().updateCoverInstitucion('UNAN');
    const logos = estado().portada.logos!;
    expect(logos).toHaveLength(1);
    expect(logos[0].asset).toBe('logo_unan.png');
  });

  it('deseleccionar la institucion se lleva el logo', () => {
    estado().updateCoverInstitucion('UNAN');
    estado().updateCoverInstitucion(null);
    expect(estado().portada.logos!).toHaveLength(0);
  });

  it('el ancho del logo es una fraccion del ancho util, en las dos hojas', () => {
    // El mismo size RELATIVO en Carta y en A4. Con milimetros absolutos el logo
    // se ve distinto segun la hoja, y la preview miente.
    estado().updateCoverInstitucion('UNI');
    const logo = estado().portada.logos![0];
    const carta = fraccionDeAnchoUtil(logo.ancho_fraccion, 'carta');
    const a4 = fraccionDeAnchoUtil(logo.ancho_fraccion, 'a4');
    expect(carta / anchoUtilMm('carta')).toBeCloseTo(logo.ancho_fraccion, 6);
    expect(a4 / anchoUtilMm('a4')).toBeCloseTo(logo.ancho_fraccion, 6);
    expect(carta).not.toBeCloseTo(a4, 1);
  });

  it('el logo UNI mide 5.2 cm en carta, no la mitad', () => {
    /* La cuenta que fija el default, del lado del cliente: el logo se ponia con
       `Cm(5.2)` y eso es 5.2 / 16.51 = 0.315 del ancho util de una carta. Con el
       0.16 del plan (que salia de un ancho util de 13.59 cm que el proyecto
       nunca tuvo) el logo quedaba en 2.64 cm: la mitad, y el usuario lo reporto
       como "el logo que puso es super pequeno no se ve".

       El store escribe la MISMA fraccion que el default de `LogoPortada` en
       `python/models.py`. Si divergen, la miniatura miente sobre el `.docx`,
       que es justo lo que la fase vino a matar. */
    estado().updateCoverInstitucion('UNI');
    const logo = estado().portada.logos![0];
    expect(logo.ancho_fraccion).toBeCloseTo(FRACCION_DE_ANCHO_DEL_LOGO, 6);
    expect(fraccionDeAnchoUtil(logo.ancho_fraccion, 'carta') / 10).toBeCloseTo(5.2, 1);
  });

  it('un documento guardado con el logo dentro de la institucion abre igual', () => {
    // Una sesion vieja no trae `logos`: el logo se resuelve del nombre de la
    // institucion al cargar, no se inventa uno para el documento nuevo.
    portadaDe({ institution: 'Universidad Nacional Autónoma de Nicaragua (UNAN-Managua)' });
    estado().migrarActa({} as never);
    expect(estado().portada.logos!).toEqual([]);
    // Y elegir el chip desde ahi vuelve a enhebrar el logo correcto.
    estado().updateCoverInstitucion('UNAN');
    expect(estado().portada.logos![0].asset).toBe('logo_unan.png');
  });
});
